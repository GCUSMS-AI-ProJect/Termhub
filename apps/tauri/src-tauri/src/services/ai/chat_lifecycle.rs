// Chat preparation, request registry, cancellation, and public chat entry points.
#[derive(Clone)]
struct PreparedChatRequest {
    request: AiChatRequest,
    provider: StoredAiProvider,
    api_key: Option<String>,
    conversation: StoredConversation,
    context_attachment: Option<AiContextAttachment>,
    prompt_context: Option<AiPromptContext>,
    response_mode: AiChatResponseMode,
    reasoning_effort: Option<AiReasoningEffort>,
    copilot_mode: AiCopilotMode,
    copilot_session_generation: u64,
    source_window_label: Option<String>,
}

fn prepare_copilot_mode(
    window_label: &str,
    requested_mode: AiCopilotMode,
) -> Result<StoredAiModeState, AppError> {
    let state = mode_state_for_window(window_label)?;
    if state.mode != requested_mode {
        return Err(ai_error(
            "AI_MODE_CHANGED",
            "Copilot 模式已变化，请刷新当前面板后重试",
        ));
    }
    Ok(state)
}

fn copilot_mode_state_is_current(
    state: &StoredAiModeState,
    mode: AiCopilotMode,
    session_generation: u64,
) -> bool {
    state.mode == mode && state.session_generation == session_generation && state.mode.uses_tools()
}

fn validate_context_for_mode(
    mode_state: &StoredAiModeState,
    context_attachment: Option<&AiContextAttachment>,
) -> Result<(), AppError> {
    let needs_context = effective_context_attachment(mode_state);
    if needs_context && context_attachment.is_none() {
        return Err(ai_error(
            "AI_CONTEXT_NOT_FOUND",
            "当前 Copilot 模式需要先预览并确认 L2 终端上下文",
        ));
    }
    if context_attachment.is_some_and(|attachment| attachment.mode != AiContextMode::Level2) {
        return Err(ai_error(
            "AI_CONTEXT_TARGET_CHANGED",
            "当前 Copilot 模式只接受 L2 终端上下文，请重新预览",
        ));
    }
    Ok(())
}

async fn prepare_start_chat(
    app: &AppHandle,
    window_label: &str,
    input: StartAiChatInput,
) -> Result<PreparedChatRequest, AppError> {
    let conversation_id = validate_conversation_id(&input.conversation_id)?;
    let provider_id = normalize_provider_id(&input.provider_id)?;
    let user_message = normalize_user_message(
        if input.user_message.trim().is_empty() && !input.attachments.is_empty() {
            "请分析这些附件。"
        } else {
            &input.user_message
        },
    )?;
    let attachments = prepare_ai_uploads(&input.attachments)?;
    let mode_state = prepare_copilot_mode(window_label, input.mode)?;
    let response_mode = AiChatResponseMode::Chat;
    let (mut provider, api_key) = resolve_chat_provider(app, &provider_id)?;
    if let Some(ref model_override) = input.model_override {
        let m = model_override.trim();
        if !m.is_empty() {
            provider.model = m.to_string();
        }
    };
    let (context_attachment, prompt_context) = match input.context_snapshot_id.as_deref() {
        Some(snapshot_id) => consume_context_snapshot(app, window_label, &provider.id, snapshot_id)
            .await
            .map(|(attachment, prompt)| (Some(attachment), Some(prompt)))?,
        None => (None, None),
    };
    validate_context_for_mode(&mode_state, context_attachment.as_ref())?;

    let workspace_id = {
        let _guard = conversation_store_lock()?;
        read_stored_conversation(app, &conversation_id)?.workspace_id
    };
    let workspace = workspace_id
        .as_deref()
        .map(|id| find_ai_workspace(app, id))
        .transpose()?;
    if let Some(workspace) = &workspace {
        validate_workspace_target(app, workspace, context_attachment.as_ref()).await?;
    }

    let _guard = conversation_store_lock()?;
    let mut index = read_conversation_index(app)?;
    require_indexed_conversation(&index, &conversation_id)?;
    let mut conversation = read_stored_conversation(app, &conversation_id)?;
    if conversation.workspace_id != workspace_id {
        return Err(workspace_error("工作空间已变化，请重新发送"));
    }
    conversation.workspace = workspace;
    let timestamp = now_timestamp();
    let user_message_id = crate::storage::new_id("ai-message");
    conversation.provider_id = provider.id.clone();
    conversation.updated_at = timestamp.clone();
    if conversation.messages.is_empty() {
        conversation.title = title_from_user_message(&user_message);
    }
    conversation.task = Some(running_task(&user_message_id));
    conversation.messages.push(AiMessage {
        id: user_message_id.clone(),
        role: AiMessageRole::User,
        content: user_message,
        created_at: timestamp,
        context: context_attachment.clone(),
        tool_activities: Vec::new(),
        attachments,
    });
    let uploads = conversation
        .messages
        .last()
        .expect("just appended user message")
        .attachments
        .clone();
    let saved = save_ai_attachments(app, &conversation_id, &uploads)
        .and_then(|_| hydrate_ai_attachments(app, &mut conversation))
        .and_then(|_| persist_conversation(app, &mut index, &conversation));
    if let Err(error) = saved {
        remove_ai_attachment_files(app, &uploads);
        return Err(error);
    }

    Ok(PreparedChatRequest {
        request: AiChatRequest {
            request_id: crate::storage::new_id("ai-request"),
            conversation_id,
            user_message_id,
            assistant_message_id: crate::storage::new_id("ai-message"),
        },
        provider,
        api_key,
        conversation,
        context_attachment,
        prompt_context,
        response_mode,
        reasoning_effort: input.reasoning_effort,
        copilot_mode: mode_state.mode,
        copilot_session_generation: mode_state.session_generation,
        source_window_label: Some(window_label.to_string()),
    })
}

async fn prepare_retry_chat(
    app: &AppHandle,
    window_label: &str,
    input: RetryAiChatInput,
) -> Result<PreparedChatRequest, AppError> {
    let conversation_id = validate_conversation_id(&input.conversation_id)?;
    let provider_id = normalize_provider_id(&input.provider_id)?;
    let mode_state = prepare_copilot_mode(window_label, input.mode)?;
    let response_mode = AiChatResponseMode::Chat;
    let (mut provider, api_key) = resolve_chat_provider(app, &provider_id)?;
    if let Some(ref model_override) = input.model_override {
        let m = model_override.trim();
        if !m.is_empty() {
            provider.model = m.to_string();
        }
    }
    let (context_attachment, prompt_context) = match input.context_snapshot_id.as_deref() {
        Some(snapshot_id) => consume_context_snapshot(app, window_label, &provider.id, snapshot_id)
            .await
            .map(|(attachment, prompt)| (Some(attachment), Some(prompt)))?,
        None => (None, None),
    };
    validate_context_for_mode(&mode_state, context_attachment.as_ref())?;

    let workspace_id = {
        let _guard = conversation_store_lock()?;
        read_stored_conversation(app, &conversation_id)?.workspace_id
    };
    let workspace = workspace_id
        .as_deref()
        .map(|id| find_ai_workspace(app, id))
        .transpose()?;
    if let Some(workspace) = &workspace {
        validate_workspace_target(app, workspace, context_attachment.as_ref()).await?;
    }

    let _guard = conversation_store_lock()?;
    let mut index = read_conversation_index(app)?;
    require_indexed_conversation(&index, &conversation_id)?;
    let mut conversation = read_stored_conversation(app, &conversation_id)?;
    if conversation.workspace_id != workspace_id {
        return Err(workspace_error("工作空间已变化，请重试"));
    }
    conversation.workspace = workspace;
    hydrate_ai_attachments(app, &mut conversation)?;
    let user_message_id = conversation
        .task
        .as_ref()
        .filter(|task| task.status != "completed")
        .map(|task| task.user_message_id.clone())
        .or_else(|| {
            conversation
                .messages
                .last()
                .filter(|m| m.role == AiMessageRole::User)
                .map(|m| m.id.clone())
        })
        .ok_or_else(|| ai_error("AI_CONVERSATION_INVALID_INPUT", "没有可以继续的未完成任务"))?;
    if let (Some(previous), Some(current)) = (
        conversation
            .messages
            .iter()
            .find(|message| message.id == user_message_id)
            .and_then(|message| message.context.as_ref()),
        context_attachment.as_ref(),
    ) {
        if previous.target.tab_id != current.target.tab_id
            || previous.target.session_type != current.target.session_type
            || previous.target.display_host != current.target.display_host
            || previous.target.user != current.target.user
        {
            return Err(ai_error(
                "AI_CONTEXT_TARGET_CHANGED",
                "未完成任务绑定的主机或用户已变化，请在新提问中确认新的目标",
            ));
        }
    }
    conversation.resume_context = Some(task_resume_context(&conversation, &user_message_id));
    let previous_steps = conversation
        .task
        .as_ref()
        .map(|task| task.steps.clone())
        .unwrap_or_default();
    conversation.task = Some(running_task(&user_message_id));
    if let Some(task) = conversation.task.as_mut() {
        task.steps = previous_steps;
    }
    if let Some(context_attachment) = context_attachment.as_ref() {
        if let Some(message) = conversation
            .messages
            .iter_mut()
            .find(|message| message.id == user_message_id)
        {
            message.context = Some(context_attachment.clone());
        }
    }
    if conversation.provider_id != provider.id {
        conversation.provider_id = provider.id.clone();
    }
    conversation.updated_at = now_timestamp();
    persist_conversation(app, &mut index, &conversation)?;

    Ok(PreparedChatRequest {
        request: AiChatRequest {
            request_id: crate::storage::new_id("ai-request"),
            conversation_id,
            user_message_id,
            assistant_message_id: crate::storage::new_id("ai-message"),
        },
        provider,
        api_key,
        conversation,
        context_attachment,
        prompt_context,
        response_mode,
        reasoning_effort: input.reasoning_effort,
        copilot_mode: mode_state.mode,
        copilot_session_generation: mode_state.session_generation,
        source_window_label: Some(window_label.to_string()),
    })
}

fn append_assistant_messages(
    app: &AppHandle,
    request: &AiChatRequest,
    provider: &StoredAiProvider,
    messages: Vec<AssistantMessageDraft>,
) -> Result<AiConversation, AppError> {
    if messages
        .iter()
        .all(|message| message.content.trim().is_empty())
    {
        return Err(ai_error(
            "AI_PROVIDER_RESPONSE_INVALID",
            "AI Provider 未返回可显示的回答",
        ));
    }
    let content_length = messages
        .iter()
        .map(|message| message.content.chars().count())
        .sum::<usize>();
    if content_length > MAX_ASSISTANT_MESSAGE_LENGTH {
        return Err(ai_error(
            "AI_CONVERSATION_LIMIT",
            "AI 回答超过本地对话长度限制",
        ));
    }
    let _guard = conversation_store_lock()?;
    let mut index = read_conversation_index(app)?;
    require_indexed_conversation(&index, &request.conversation_id)?;
    let mut conversation = read_stored_conversation(app, &request.conversation_id)?;
    if conversation
        .messages
        .iter()
        .rev()
        .find(|message| message.role == AiMessageRole::User)
        .map(|message| message.id.as_str())
        != Some(request.user_message_id.as_str())
    {
        return Err(ai_error(
            "AI_CONVERSATION_INVALID_INPUT",
            "AI 对话已变化，请重新发送提问",
        ));
    }
    conversation.updated_at = now_timestamp();
    for message in messages {
        remember_provider_reasoning(&mut conversation, provider, &message);
        let existing = checkpoint_message(&mut conversation, &message.id);
        existing.content = message.content;
        for activity in message.tool_activities {
            if let Some(previous) = existing
                .tool_activities
                .iter_mut()
                .find(|previous| previous.proposal.id == activity.proposal.id)
            {
                // Retain the original approval metadata/file preview recorded
                // before execution; the final projection supplies its outcome.
                if let Some(result) = activity.result {
                    record_tool_result(previous, &result);
                }
            } else {
                existing.tool_activities.push(activity);
            }
        }
    }
    if let Some(task) = conversation.task.as_mut() {
        finalize_task_state(task);
        task.updated_at = now_timestamp();
    }
    persist_conversation(app, &mut index, &conversation)?;
    Ok(public_conversation(conversation))
}

fn chat_registry_lock(
) -> Result<std::sync::MutexGuard<'static, ActiveChatRequestRegistry>, AppError> {
    ACTIVE_CHAT_REQUESTS
        .lock()
        .map_err(|_| AppError::Storage("AI 对话请求锁不可用".to_string()))
}

fn register_chat_request(
    request_id: &str,
    conversation_id: &str,
    cancellation: CancellationToken,
) -> Result<(), AppError> {
    let mut registry = chat_registry_lock()?;
    if registry.by_conversation.contains_key(conversation_id) {
        return Err(ai_error(
            "AI_CONVERSATION_LIMIT",
            "当前对话正在生成，请等待完成或先停止",
        ));
    }
    registry
        .by_request
        .insert(request_id.to_string(), cancellation);
    registry
        .by_conversation
        .insert(conversation_id.to_string(), request_id.to_string());
    Ok(())
}

fn unregister_chat_request(request_id: &str, conversation_id: &str) {
    let Ok(mut registry) = ACTIVE_CHAT_REQUESTS.lock() else {
        return;
    };
    registry.by_request.remove(request_id);
    if registry
        .by_conversation
        .get(conversation_id)
        .is_some_and(|active_request_id| active_request_id == request_id)
    {
        registry.by_conversation.remove(conversation_id);
    }
}

pub fn cancel_chat(request_id: &str) -> Result<(), AppError> {
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return Err(ai_error("AI_REQUEST_CANCELLED", "AI 请求 ID 无效"));
    }
    let cancellation = chat_registry_lock()?.by_request.get(request_id).cloned();
    if let Some(cancellation) = cancellation {
        cancellation.cancel();
    }
    Ok(())
}

fn emit_stream_event(
    channel: &Channel<AiStreamEvent>,
    event: AiStreamEvent,
) -> Result<(), AppError> {
    channel
        .send(event)
        .map_err(|_| ai_error("AI_REQUEST_CANCELLED", "AI 对话窗口已关闭，已停止生成"))
}

fn stream_error_event(error: AppError) -> AiStreamEvent {
    let raw = error.to_string();
    // AI failures are created as `AppError::Command`, whose display wrapper
    // prefixes the payload with `command error: `. Strip only that stable
    // wrapper before decoding the typed AI error. Otherwise every streamed
    // AI failure silently degrades to the generic connection error.
    let raw = raw.strip_prefix("command error: ").unwrap_or(&raw);
    let known_code = raw
        .split_once(": ")
        .map(|(code, message)| (code, message.to_string()))
        .filter(|(code, _)| code.starts_with("AI_"));
    let (code, message) = known_code.unwrap_or((
        "AI_PROVIDER_CONNECTION_FAILED",
        "AI Provider 请求失败，请检查连接后重试。".to_string(),
    ));
    let retryable = matches!(
        code,
        "AI_PROVIDER_CONNECTION_FAILED" | "AI_PROVIDER_HTTP_ERROR" | "AI_PROVIDER_TIMEOUT"
    );
    AiStreamEvent::Error {
        code: code.to_string(),
        message,
        retryable,
    }
}

fn launch_chat_request(
    app: AppHandle,
    prepared: PreparedChatRequest,
    channel: Channel<AiStreamEvent>,
    cancellation: CancellationToken,
) {
    tauri::async_runtime::spawn(async move {
        let request_id = prepared.request.request_id.clone();
        let conversation_id = prepared.request.conversation_id.clone();
        let destination = channel.clone();
        let (channel, checkpoint_failure) =
            checkpoint_channel(app.clone(), prepared.request.clone(), channel);
        let result = run_chat_request(&app, &prepared, &channel, &cancellation).await;
        if let Err(error) = result {
            let _ = emit_stream_event(&channel, stream_error_event(error));
        }
        if let Ok(mut failure) = checkpoint_failure.lock() {
            if let Some(error) = failure.take() {
                let event = if error.to_string().contains("AI_CONVERSATION_LIMIT") {
                    stream_error_event(error)
                } else {
                    AiStreamEvent::Error { code: "AI_CONVERSATION_STORAGE_FAILED".into(), message: "任务进度保存失败，已停止执行；上一次已保存的记录仍然保留。请检查磁盘空间与写入权限。".into(), retryable: false }
                };
                let _ = emit_stream_event(&destination, event);
            }
        }
        unregister_chat_request(&request_id, &conversation_id);
    });
}

pub async fn start_chat(
    app: &AppHandle,
    window: &WebviewWindow,
    input: StartAiChatInput,
    channel: Channel<AiStreamEvent>,
) -> Result<AiChatRequest, AppError> {
    let conversation_id = validate_conversation_id(&input.conversation_id)?;
    let request_id = crate::storage::new_id("ai-request");
    let cancellation = CancellationToken::new();
    register_chat_request(&request_id, &conversation_id, cancellation.clone())?;
    let prepared = match prepare_start_chat(app, window.label(), input).await {
        Ok(mut prepared) => {
            prepared.request.request_id = request_id.clone();
            prepared
        }
        Err(error) => {
            unregister_chat_request(&request_id, &conversation_id);
            return Err(error);
        }
    };
    let request = prepared.request.clone();
    launch_chat_request(app.clone(), prepared, channel, cancellation);
    Ok(request)
}

pub async fn retry_chat(
    app: &AppHandle,
    window: &WebviewWindow,
    input: RetryAiChatInput,
    channel: Channel<AiStreamEvent>,
) -> Result<AiChatRequest, AppError> {
    let conversation_id = validate_conversation_id(&input.conversation_id)?;
    let request_id = crate::storage::new_id("ai-request");
    let cancellation = CancellationToken::new();
    register_chat_request(&request_id, &conversation_id, cancellation.clone())?;
    let prepared = match prepare_retry_chat(app, window.label(), input).await {
        Ok(mut prepared) => {
            prepared.request.request_id = request_id.clone();
            prepared
        }
        Err(error) => {
            unregister_chat_request(&request_id, &conversation_id);
            return Err(error);
        }
    };
    let request = prepared.request.clone();
    launch_chat_request(app.clone(), prepared, channel, cancellation);
    Ok(request)
}

#[derive(Clone, Debug)]
struct ProviderToolCall {
    id: String,
    item_id: Option<String>,
    name: String,
    arguments: String,
    google_thought_signature: Option<String>,
}

#[derive(Default)]
struct ToolCallAccumulator {
    id: String,
    item_id: String,
    name: String,
    arguments: String,
    google_thought_signature: Option<String>,
}

#[derive(Clone, Debug)]
struct ToolLoopResult {
    call_id: String,
    content: String,
}

#[derive(Clone, Debug)]
struct ToolLoopTurn {
    follow_up: Option<String>,
    assistant_text: String,
    continuation: ProviderContinuation,
    calls: Vec<ProviderToolCall>,
    results: Vec<ToolLoopResult>,
}

struct AssistantMessageDraft {
    id: String,
    content: String,
    tool_activities: Vec<AiToolActivity>,
    reasoning_content: Option<String>,
}

#[derive(Default)]
struct ChatStreamResult {
    content: String,
    continuation: ProviderContinuation,
    finish_reason: Option<String>,
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    tool_calls: Vec<ProviderToolCall>,
    tool_call_accumulators: BTreeMap<String, ToolCallAccumulator>,
}

impl ChatStreamResult {
    fn finalize_tool_calls(&mut self) {
        if !self.tool_calls.is_empty() {
            return;
        }
        self.tool_calls = self
            .tool_call_accumulators
            .values()
            .filter(|call| !call.name.trim().is_empty())
            .enumerate()
            .map(|(index, call)| ProviderToolCall {
                id: if call.id.trim().is_empty() {
                    format!("transterm-tool-call-{index}")
                } else {
                    call.id.clone()
                },
                item_id: (!call.item_id.trim().is_empty()).then(|| call.item_id.clone()),
                name: call.name.clone(),
                arguments: call.arguments.clone(),
                google_thought_signature: call.google_thought_signature.clone(),
            })
            .collect();
    }
}
