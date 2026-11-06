#[tauri::command]
pub async fn app_preview_directory_sync(
    app: AppHandle,
    input: crate::services::transfers::DirectorySyncInput,
) -> Result<crate::services::transfers::DirectorySyncPreview, AppError> {
    crate::services::transfers::preview_directory_sync(&app, input).await
}

#[tauri::command]
pub fn app_cancel_directory_sync_preview(request_id: String) {
    crate::services::transfers::cancel_sync_preview(&request_id);
}

#[tauri::command]
pub async fn app_apply_directory_sync(
    app: AppHandle,
    preview_id: String,
    selected_paths: Vec<String>,
) -> Result<String, AppError> {
    crate::services::transfers::apply_directory_sync(&app, &preview_id, selected_paths).await
}
