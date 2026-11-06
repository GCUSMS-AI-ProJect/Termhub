// AI provider, conversation, mode, preview, and chat commands.
#[tauri::command]
pub fn app_read_ai_attachment_files(
    paths: Vec<String>,
) -> Result<Vec<crate::services::ai::AiAttachmentUpload>, AppError> {
    crate::services::ai::read_ai_attachment_files(paths)
}

#[tauri::command]
pub fn app_list_ai_workspaces(
    app: AppHandle,
) -> Result<Vec<crate::services::ai::AiWorkspace>, AppError> {
    crate::services::ai::list_ai_workspaces(&app)
}

#[tauri::command]
pub async fn app_save_ai_workspace(
    app: AppHandle,
    input: crate::services::ai::SaveAiWorkspaceInput,
) -> Result<crate::services::ai::AiWorkspace, AppError> {
    crate::services::ai::save_ai_workspace(&app, input).await
}

#[tauri::command]
pub fn app_delete_ai_workspace(app: AppHandle, workspace_id: String) -> Result<(), AppError> {
    crate::services::ai::delete_ai_workspace(&app, &workspace_id)
}

#[tauri::command]
pub fn app_get_ai_attachment_preview(
    app: AppHandle,
    conversation_id: String,
    attachment_id: String,
) -> Result<String, AppError> {
    crate::services::ai::get_ai_attachment_preview(&app, &conversation_id, &attachment_id)
}

#[tauri::command]
pub async fn app_get_rea_activation(
    app: AppHandle,
    window: WebviewWindow,
    input: crate::services::ai::CheckReaInput,
) -> Result<crate::services::ai::ReaActivation, AppError> {
    crate::services::ai::get_rea_activation(&app, &window, input).await
}

#[tauri::command]
pub async fn app_set_rea_enabled(
    app: AppHandle,
    window: WebviewWindow,
    input: crate::services::ai::SetReaEnabledInput,
    on_progress: tauri::ipc::Channel<crate::services::rea::progress::ReaPreparationProgress>,
) -> Result<crate::services::ai::ReaActivation, AppError> {
    crate::services::ai::set_rea_enabled(&app, &window, input, Some(on_progress)).await
}

#[tauri::command]
pub async fn app_check_rea(
    app: AppHandle,
    window: WebviewWindow,
    input: crate::services::ai::CheckReaInput,
    on_progress: tauri::ipc::Channel<crate::services::rea::progress::ReaPreparationProgress>,
) -> Result<crate::services::rea::ReaStatus, AppError> {
    crate::services::ai::check_rea(&app, &window, input, Some(on_progress)).await
}

#[tauri::command]
pub fn app_cancel_rea_check(window: WebviewWindow, request_id: String) -> Result<(), AppError> {
    crate::services::ai::cancel_rea_check(&window, &request_id)
}

#[tauri::command]
pub fn app_list_ai_providers(
    app: AppHandle,
) -> Result<Vec<crate::services::ai::AiProviderSummary>, AppError> {
    crate::services::ai::list_providers(&app)
}

#[tauri::command]
pub async fn app_list_ai_models(
    app: AppHandle,
    input: crate::services::ai::ListAiModelsInput,
) -> Result<Vec<crate::services::ai::AiModelInfo>, AppError> {
    crate::services::ai::list_models(&app, input).await
}

#[tauri::command]
pub fn app_save_ai_provider(
    app: AppHandle,
    input: crate::services::ai::SaveAiProviderInput,
) -> Result<crate::services::ai::AiProviderSummary, AppError> {
    crate::services::ai::save_provider(&app, input)
}

#[tauri::command]
pub fn app_delete_ai_provider(
    app: AppHandle,
    provider_id: String,
) -> Result<Vec<crate::services::ai::AiProviderSummary>, AppError> {
    crate::services::ai::delete_provider(&app, &provider_id)
}

#[tauri::command]
pub async fn app_test_ai_provider(
    app: AppHandle,
    input: crate::services::ai::TestAiProviderInput,
) -> Result<crate::services::ai::AiProviderTestResult, AppError> {
    crate::services::ai::test_provider(&app, input).await
}

#[tauri::command]
pub fn app_list_ai_conversations(
    app: AppHandle,
) -> Result<Vec<crate::services::ai::AiConversationSummary>, AppError> {
    crate::services::ai::list_conversations(&app)
}

#[tauri::command]
pub fn app_get_ai_conversation(
    app: AppHandle,
    conversation_id: String,
) -> Result<crate::services::ai::AiConversation, AppError> {
    crate::services::ai::get_conversation(&app, &conversation_id)
}

#[tauri::command]
pub fn app_create_ai_conversation(
    app: AppHandle,
    input: crate::services::ai::CreateAiConversationInput,
) -> Result<crate::services::ai::AiConversation, AppError> {
    crate::services::ai::create_conversation(&app, input)
}

#[tauri::command]
pub fn app_rename_ai_conversation(
    app: AppHandle,
    input: crate::services::ai::RenameAiConversationInput,
) -> Result<crate::services::ai::AiConversation, AppError> {
    crate::services::ai::rename_conversation(&app, input)
}

#[tauri::command]
pub async fn app_summarize_ai_conversation_title(
    app: AppHandle,
    input: crate::services::ai::SummarizeAiConversationTitleInput,
) -> Result<crate::services::ai::AiConversation, AppError> {
    crate::services::ai::summarize_conversation_title(&app, input).await
}

#[tauri::command]
pub fn app_delete_ai_message(
    app: AppHandle,
    input: crate::services::ai::DeleteAiMessageInput,
) -> Result<crate::services::ai::AiConversation, AppError> {
    crate::services::ai::delete_message(&app, input)
}

#[tauri::command]
pub fn app_delete_ai_conversation(app: AppHandle, conversation_id: String) -> Result<(), AppError> {
    crate::services::ai::delete_conversation(&app, &conversation_id)
}

#[tauri::command]
pub fn app_get_ai_copilot_mode_state(
    window: WebviewWindow,
) -> Result<crate::services::ai::AiCopilotModeState, AppError> {
    crate::services::ai::get_copilot_mode_state(&window)
}

#[tauri::command]
pub fn app_set_ai_copilot_mode(
    window: WebviewWindow,
    input: crate::services::ai::SetAiCopilotModeInput,
) -> Result<crate::services::ai::AiCopilotModeState, AppError> {
    crate::services::ai::set_copilot_mode(&window, input)
}

#[tauri::command]
pub fn app_set_ai_context_attach(
    window: WebviewWindow,
    input: crate::services::ai::SetAiContextAttachInput,
) -> Result<crate::services::ai::AiCopilotModeState, AppError> {
    crate::services::ai::set_context_attach(&window, input)
}

#[tauri::command]
pub fn app_set_ai_dangerous_command_restrictions(
    window: WebviewWindow,
    input: crate::services::ai::SetAiDangerousCommandRestrictionsInput,
) -> Result<crate::services::ai::AiCopilotModeState, AppError> {
    crate::services::ai::set_dangerous_command_restrictions(&window, input)
}

#[tauri::command]
pub async fn app_create_ai_context_preview(
    app: AppHandle,
    window: WebviewWindow,
    input: crate::services::ai::CreateAiContextPreviewInput,
) -> Result<crate::services::ai::AiContextPreview, AppError> {
    crate::services::ai::create_context_preview(&app, &window, input).await
}

#[tauri::command]
pub async fn app_start_ai_chat(
    app: AppHandle,
    window: WebviewWindow,
    input: crate::services::ai::StartAiChatInput,
    channel: Channel<crate::services::ai::AiStreamEvent>,
) -> Result<crate::services::ai::AiChatRequest, AppError> {
    crate::services::ai::start_chat(&app, &window, input, channel).await
}

#[tauri::command]
pub async fn app_retry_ai_chat(
    app: AppHandle,
    window: WebviewWindow,
    input: crate::services::ai::RetryAiChatInput,
    channel: Channel<crate::services::ai::AiStreamEvent>,
) -> Result<crate::services::ai::AiChatRequest, AppError> {
    crate::services::ai::retry_chat(&app, &window, input, channel).await
}

#[tauri::command]
pub fn app_cancel_ai_chat(request_id: String) -> Result<(), AppError> {
    crate::services::ai::cancel_chat(&request_id)
}
