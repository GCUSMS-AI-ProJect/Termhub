#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySyncInput {
    pub request_id: String,
    pub tab_id: String,
    pub local_directory: String,
    pub remote_directory: String,
    pub direction: String,
    #[serde(default)]
    pub ignore_patterns: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySyncEntry {
    pub path: String,
    pub status: String,
    pub size: u64,
    #[serde(skip)]
    source_identity: Option<TransferFileIdentity>,
    #[serde(skip)]
    destination_identity: Option<TransferFileIdentity>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySyncPreview {
    pub id: String,
    pub input: DirectorySyncInput,
    pub entries: Vec<DirectorySyncEntry>,
    #[serde(skip)]
    binding: String,
    #[serde(skip)]
    canonical_local_root: String,
    #[serde(skip)]
    created_at: u64,
}

static SYNC_PREVIEWS: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, DirectorySyncPreview>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));
static SYNC_REQUESTS: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, CancellationToken>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

fn sync_glob(value: &str, pattern: &str) -> bool {
    let (value, pattern) = (value.as_bytes(), pattern.as_bytes());
    let (mut v, mut p, mut star, mut matched) = (0, 0, None, 0);
    while v < value.len() {
        if p < pattern.len() && (pattern[p] == b'?' || pattern[p] == value[v]) {
            v += 1;
            p += 1;
        } else if p < pattern.len() && pattern[p] == b'*' {
            star = Some(p);
            p += 1;
            matched = v;
        } else if let Some(index) = star {
            matched += 1;
            v = matched;
            p = index + 1;
        } else {
            return false;
        }
    }
    while p < pattern.len() && pattern[p] == b'*' {
        p += 1;
    }
    p == pattern.len()
}

fn sync_ignored(relative: &str, patterns: &[String]) -> bool {
    patterns
        .iter()
        .map(|p| p.trim().trim_matches('/'))
        .filter(|p| !p.is_empty())
        .any(|pattern| {
            if pattern.contains('/') {
                sync_glob(relative, pattern) || relative.starts_with(&format!("{pattern}/"))
            } else {
                relative.split('/').any(|part| sync_glob(part, pattern))
            }
        })
}

async fn sync_binding(app: &AppHandle, tab_id: &str) -> Result<String, AppError> {
    let state = app.state::<crate::services::workspace::WorkspaceState>();
    let revision = state.ai_session_revision(tab_id).await;
    let tabs = state.tabs.read().await;
    let tab = tabs
        .iter()
        .find(|tab| tab.id == tab_id)
        .ok_or_else(|| transfer_error("SYNC_TARGET_CHANGED: Session closed"))?;
    let sessions = state.sessions.read().await;
    let session = sessions
        .get(tab_id)
        .filter(|session| session.connected && session.capabilities.files)
        .ok_or_else(|| transfer_error("SYNC_TARGET_CHANGED: File channel unavailable"))?;
    Ok(serde_json::json!([
        tab_id,
        tab.profile_id,
        tab.session_type,
        session.access_host,
        session.file_access_mode,
        session.login_user,
        session.sudo_user,
        revision
    ])
    .to_string())
}

async fn sync_remote_identity(
    app: &AppHandle,
    tab_id: &str,
    path: String,
) -> Result<Option<TransferFileIdentity>, AppError> {
    Ok(worker_call(app, tab_id, |respond_to, cancellation| {
        WorkerCmd::StatRemoteFile {
            path,
            cancellation,
            respond_to,
        }
    })
    .await?
    .map(|stat| TransferFileIdentity {
        size: stat.size,
        modified_at: stat.modified_at,
    }))
}

async fn sync_local_identity(path: &Path) -> Result<Option<TransferFileIdentity>, AppError> {
    match tokio::fs::symlink_metadata(path).await {
        Ok(meta)
            if meta.is_file()
                && !meta.file_type().is_symlink()
                && windows_reparse_rejection(path, &meta).is_none() =>
        {
            Ok(Some(TransferFileIdentity {
                size: meta.len(),
                modified_at: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|t| t.as_millis() as u64),
            }))
        }
        Ok(_) => Err(transfer_error(
            "SYNC_TYPE_CONFLICT: Destination is not a regular file",
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(transfer_error(error.to_string())),
    }
}

fn sync_status(
    source: &TransferFileIdentity,
    destination: Option<&TransferFileIdentity>,
) -> &'static str {
    match destination {
        None => "new",
        Some(other)
            if source.size == other.size
                && source
                    .modified_at
                    .zip(other.modified_at)
                    .is_some_and(|(a, b)| a / 1000 == b / 1000) =>
        {
            "unchanged"
        }
        Some(_) => "modified",
    }
}

async fn build_sync_preview(
    app: &AppHandle,
    input: DirectorySyncInput,
) -> Result<DirectorySyncPreview, AppError> {
    if !matches!(input.direction.as_str(), "upload" | "download")
        || !Path::new(&input.local_directory).is_absolute()
        || !input.remote_directory.starts_with('/')
        || input.remote_directory.split('/').any(|s| s == "..")
        || input.remote_directory.chars().any(char::is_control)
        || input.ignore_patterns.len() > 64
        || input.ignore_patterns.iter().any(|p| p.len() > 240)
    {
        return Err(transfer_error(
            "SYNC_INPUT_INVALID: Invalid directories or ignore patterns",
        ));
    }
    let binding = sync_binding(app, &input.tab_id).await?;
    let canonical_local_root = capture_sync_local_root(Path::new(&input.local_directory)).await?;
    let source_files = if input.direction == "upload" {
        collect_local_tree_filtered(Path::new(&input.local_directory), &input.ignore_patterns)
            .await?
            .1
            .into_iter()
            .map(|(path, identity)| {
                Ok((
                    local_upload_relative_path(Path::new(&input.local_directory), &path)?,
                    identity,
                ))
            })
            .collect::<Result<Vec<_>, AppError>>()?
    } else {
        collect_remote_tree_filtered(
            app,
            &input.tab_id,
            &input.remote_directory,
            &input.ignore_patterns,
        )
        .await?
        .1
        .into_iter()
        .map(|(path, identity)| {
            Ok((
                relative_remote_path(&input.remote_directory, &path)?,
                identity,
            ))
        })
        .collect::<Result<Vec<_>, AppError>>()?
    };
    if source_files.len() > 10_000 {
        return Err(transfer_error(
            "SYNC_PREVIEW_LIMIT: Select a directory with at most 10000 files",
        ));
    }
    let mut entries = Vec::with_capacity(source_files.len());
    for (path, source) in source_files {
        validate_sync_local_path(
            Path::new(&input.local_directory),
            &canonical_local_root,
            &Path::new(&input.local_directory).join(&path),
        )
        .await?;
        let destination = if input.direction == "upload" {
            sync_remote_identity(
                app,
                &input.tab_id,
                join_remote_path(&input.remote_directory, &path),
            )
            .await?
        } else {
            sync_local_identity(&Path::new(&input.local_directory).join(&path)).await?
        };
        entries.push(DirectorySyncEntry {
            status: sync_status(&source, destination.as_ref()).into(),
            size: source.size,
            path,
            source_identity: Some(source),
            destination_identity: destination,
        });
    }
    if sync_binding(app, &input.tab_id).await? != binding {
        return Err(transfer_error(
            "SYNC_TARGET_CHANGED: Session changed during preview",
        ));
    }
    Ok(DirectorySyncPreview {
        canonical_local_root,
        id: format!("sync-{}", uuid::Uuid::new_v4()),
        input,
        entries,
        binding,
        created_at: now_ms(),
    })
}

pub fn cancel_sync_preview(request_id: &str) {
    if let Ok(requests) = SYNC_REQUESTS.lock() {
        if let Some(token) = requests.get(request_id) {
            token.cancel();
        }
    }
}

pub async fn preview_directory_sync(
    app: &AppHandle,
    input: DirectorySyncInput,
) -> Result<DirectorySyncPreview, AppError> {
    if input.request_id.is_empty() || input.request_id.len() > 100 {
        return Err(transfer_error("Invalid sync request identifier"));
    }
    let request_id = input.request_id.clone();
    let token = CancellationToken::new();
    {
        let mut requests = SYNC_REQUESTS
            .lock()
            .map_err(|_| transfer_error("Sync request lock unavailable"))?;
        if requests.len() >= 4 || requests.contains_key(&request_id) {
            return Err(transfer_error("Sync previews are busy"));
        }
        requests.insert(request_id.clone(), token.clone());
    }
    let result = tokio::select! {
        _ = token.cancelled() => Err(transfer_error("SYNC_CANCELLED: Preview cancelled")),
        result = tokio::time::timeout(Duration::from_secs(120), build_sync_preview(app, input)) => result.unwrap_or_else(|_| Err(transfer_error("SYNC_TIMEOUT: Select a smaller directory"))),
    };
    if let Ok(mut requests) = SYNC_REQUESTS.lock() {
        requests.remove(&request_id);
    }
    let preview = result?;
    let mut previews = SYNC_PREVIEWS
        .lock()
        .map_err(|_| transfer_error("Sync preview lock unavailable"))?;
    previews.retain(|_, p| now_ms().saturating_sub(p.created_at) < 10 * 60 * 1000);
    if previews.len() >= 20 {
        return Err(transfer_error(
            "Too many sync previews; close older previews",
        ));
    }
    previews.insert(preview.id.clone(), preview.clone());
    Ok(preview)
}
