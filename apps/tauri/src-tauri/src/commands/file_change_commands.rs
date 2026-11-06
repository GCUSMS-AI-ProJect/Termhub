#[tauri::command]
pub async fn app_read_versioned_file(
    app: AppHandle,
    target: crate::services::file_changes::FileTarget,
) -> Result<crate::services::file_changes::VersionedFile, AppError> {
    crate::services::file_changes::read(&app, target).await
}

#[tauri::command]
pub async fn app_save_file_change(
    app: AppHandle,
    input: crate::services::file_changes::SaveFileChangeInput,
) -> Result<crate::services::file_changes::SavedFileChange, AppError> {
    crate::services::file_changes::save(&app, input).await
}

#[tauri::command]
pub async fn app_undo_file_change(
    app: AppHandle,
    change_id: String,
) -> Result<crate::services::file_changes::SavedFileChange, AppError> {
    crate::services::file_changes::undo(&app, &change_id).await
}
