// Persistent AI project identities; directory selection never grants tool mode.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiWorkspace {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiWorkspaceInput {
    pub name: String,
    pub kind: String,
    pub path: String,
    pub tab_id: Option<String>,
    pub root_tab_id: Option<String>,
}

static AI_WORKSPACE_STORE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

fn workspace_error(message: &str) -> AppError {
    ai_error("AI_WORKSPACE_INVALID", message)
}

fn read_ai_workspaces(app: &AppHandle) -> Result<Vec<AiWorkspace>, AppError> {
    let path = workspace_file(app, "ai-workspaces.json")?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(path).map_err(|error| AppError::Storage(error.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|error| AppError::Serialization(error.to_string()))
}

pub fn list_ai_workspaces(app: &AppHandle) -> Result<Vec<AiWorkspace>, AppError> {
    let _guard = AI_WORKSPACE_STORE_LOCK
        .lock()
        .map_err(|_| workspace_error("工作空间配置锁不可用"))?;
    read_ai_workspaces(app)
}

fn find_ai_workspace(app: &AppHandle, id: &str) -> Result<AiWorkspace, AppError> {
    list_ai_workspaces(app)?
        .into_iter()
        .find(|workspace| workspace.id == id)
        .ok_or_else(|| workspace_error("工作空间已移除，请重新选择"))
}

pub async fn save_ai_workspace(
    app: &AppHandle,
    input: SaveAiWorkspaceInput,
) -> Result<AiWorkspace, AppError> {
    let name = input.name.trim().to_string();
    let path = input.path.trim();
    if name.is_empty()
        || name.chars().count() > 120
        || path.is_empty()
        || path.len() > 4096
        || path.chars().any(char::is_control)
    {
        return Err(workspace_error("请输入有效的工作空间名称和目录"));
    }
    let (path, profile_id, host) = match input.kind.as_str() {
        "local" => {
            let directory = Path::new(path);
            if !directory.is_absolute() || !directory.is_dir() {
                return Err(workspace_error("本地工作空间必须是已存在的绝对目录"));
            }
            (path.to_string(), None, None)
        }
        "ssh" => {
            if !path.starts_with('/') {
                return Err(workspace_error("SSH 工作空间请使用 Shell 的绝对目录"));
            }
            let tab_id = input
                .tab_id
                .as_deref()
                .ok_or_else(|| workspace_error("请先打开已连接的 SSH 终端"))?;
            let (target, _) =
                resolve_context_target(app, tab_id, input.root_tab_id.as_deref(), false).await?;
            if target.session_type != "ssh" || target.network_device {
                return Err(workspace_error("请选择普通 SSH 服务器终端"));
            }
            let state = app.state::<crate::services::workspace::WorkspaceState>();
            let tabs = state.tabs.read().await;
            let profile_id = tabs
                .iter()
                .find(|tab| tab.id == tab_id)
                .map(|tab| tab.profile_id.clone())
                .ok_or_else(|| workspace_error("当前 SSH 没有可保存的连接身份"))?;
            (
                path.to_string(),
                Some(profile_id),
                Some(target.display_host),
            )
        }
        _ => return Err(workspace_error("不支持的工作空间类型")),
    };
    let _guard = AI_WORKSPACE_STORE_LOCK
        .lock()
        .map_err(|_| workspace_error("工作空间配置锁不可用"))?;
    let mut workspaces = read_ai_workspaces(app)?;
    if let Some(existing) = workspaces
        .iter()
        .find(|item| item.kind == input.kind && item.path == path && item.profile_id == profile_id)
    {
        return Ok(existing.clone());
    }
    if workspaces.len() >= 100 {
        return Err(workspace_error("工作空间最多保存 100 个"));
    }
    let workspace = AiWorkspace {
        id: crate::storage::new_id("ai-workspace"),
        name,
        kind: input.kind,
        path,
        profile_id,
        host,
        created_at: now_timestamp(),
    };
    workspaces.push(workspace.clone());
    write_json_file(&workspace_file(app, "ai-workspaces.json")?, &workspaces)?;
    Ok(workspace)
}

pub fn delete_ai_workspace(app: &AppHandle, workspace_id: &str) -> Result<(), AppError> {
    // Keep conversation files: removing a project moves its chats to ungrouped history.
    let chat_guard = chat_registry_lock()?;
    let _conversation_guard = conversation_store_lock()?;
    let _guard = AI_WORKSPACE_STORE_LOCK
        .lock()
        .map_err(|_| workspace_error("工作空间配置锁不可用"))?;
    let mut workspaces = read_ai_workspaces(app)?;
    workspaces.retain(|workspace| workspace.id != workspace_id);
    let mut index = read_conversation_index(app)?;
    let conversations = index
        .conversations
        .iter()
        .filter(|chat| chat.workspace_id.as_deref() == Some(workspace_id))
        .map(|chat| chat.id.clone())
        .collect::<Vec<_>>();
    if conversations
        .iter()
        .any(|id| chat_guard.by_conversation.contains_key(id))
    {
        return Err(workspace_error("工作空间中仍有正在生成的对话，请先停止"));
    }
    for id in conversations {
        let mut conversation = read_stored_conversation(app, &id)?;
        conversation.workspace_id = None;
        persist_conversation(app, &mut index, &conversation)?;
    }
    write_json_file(&workspace_file(app, "ai-workspaces.json")?, &workspaces)
}

async fn validate_workspace_target(
    app: &AppHandle,
    workspace: &AiWorkspace,
    target: Option<&AiContextAttachment>,
) -> Result<(), AppError> {
    let Some(target) = target else {
        return Ok(());
    };
    if workspace.kind != target.target.session_type || target.target.network_device {
        return Err(workspace_error(
            "工作空间与当前终端类型不一致，请切换到对应终端",
        ));
    }
    if workspace.kind == "ssh" {
        let state = app.state::<crate::services::workspace::WorkspaceState>();
        let tabs = state.tabs.read().await;
        let profile_id = tabs
            .iter()
            .find(|tab| tab.id == target.target.tab_id)
            .map(|tab| &tab.profile_id);
        if profile_id != workspace.profile_id.as_ref()
            || workspace.host.as_deref() != Some(&target.target.display_host)
        {
            return Err(workspace_error(
                "SSH 主机已变化，请连接工作空间所属主机后重试",
            ));
        }
    } else if !Path::new(&workspace.path).is_dir() {
        return Err(workspace_error("本地工作空间目录已不可用"));
    }
    Ok(())
}
