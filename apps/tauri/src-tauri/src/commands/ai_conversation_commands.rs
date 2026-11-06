#[tauri::command]
pub fn app_search_ai_conversations(
    app: AppHandle,
    query: String,
    workspace_id: Option<String>,
) -> Result<Vec<crate::services::ai::AiConversationSearchResult>, AppError> {
    crate::services::ai::search_conversations(&app, &query, workspace_id.as_deref())
}
#[tauri::command]
pub fn app_fork_ai_conversation(
    app: AppHandle,
    input: crate::services::ai::ForkAiConversationInput,
) -> Result<crate::services::ai::AiConversation, AppError> {
    crate::services::ai::fork_conversation(&app, input)
}
#[tauri::command]
pub fn app_get_ai_chat_draft(
    app: AppHandle,
    scope: String,
) -> Result<Option<crate::services::ai::AiChatDraft>, AppError> {
    crate::services::ai::get_chat_draft(&app, &scope)
}
#[tauri::command]
pub fn app_save_ai_chat_draft(
    app: AppHandle,
    input: crate::services::ai::AiChatDraft,
) -> Result<(), AppError> {
    crate::services::ai::save_chat_draft(&app, input)
}
#[tauri::command]
pub fn app_get_ai_message_attachments(
    app: AppHandle,
    conversation_id: String,
    message_id: String,
) -> Result<Vec<crate::services::ai::AiAttachmentUpload>, AppError> {
    crate::services::ai::get_message_attachments(&app, &conversation_id, &message_id)
}
