fn recovery_path(app: &AppHandle, id: &str) -> Result<std::path::PathBuf, AppError> {
    if !id.starts_with("file-change-")
        || id.len() > 80
        || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(error("FILE_RECOVERY_INVALID: Invalid change identifier"));
    }
    Ok(workspace_file(app, "file-change-history")?.join(format!("{id}.json")))
}

fn persist_recovery(app: &AppHandle, record: &RecoveryRecord) -> Result<(), AppError> {
    let path = recovery_path(app, &record.id)?;
    let directory = path
        .parent()
        .ok_or_else(|| error("File history directory unavailable"))?;
    std::fs::create_dir_all(directory).map_err(|e| error(e.to_string()))?;
    let bytes = serde_json::to_vec(record).map_err(|e| error(e.to_string()))?;
    if bytes.len() > MAX_TEXT_BYTES * 3 {
        return Err(error("FILE_BACKUP_FAILED: Recovery copy exceeds limit"));
    }
    std::fs::write(&path, bytes).map_err(|e| error(format!("FILE_BACKUP_FAILED: {e}")))?;
    let mut files = std::fs::read_dir(directory)
        .map_err(|e| error(e.to_string()))?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("file-change-")
        })
        .filter_map(|entry| {
            entry
                .metadata()
                .ok()
                .map(|meta| (entry.path(), meta.len(), meta.modified().ok()))
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|entry| std::cmp::Reverse(entry.2));
    let mut size = 0u64;
    for (index, (candidate, bytes, _)) in files.into_iter().enumerate() {
        size = size.saturating_add(bytes);
        if candidate != path && (index >= 100 || size > 128 * 1024 * 1024) {
            let _ = std::fs::remove_file(candidate);
        }
    }
    Ok(())
}

fn read_recovery(app: &AppHandle, id: &str) -> Result<RecoveryRecord, AppError> {
    let path = recovery_path(app, id)?;
    let bytes =
        std::fs::read(path).map_err(|e| error(format!("FILE_RECOVERY_UNAVAILABLE: {e}")))?;
    if bytes.len() > MAX_TEXT_BYTES * 3 {
        return Err(error("FILE_RECOVERY_INVALID: Backup exceeds limit"));
    }
    serde_json::from_slice(&bytes).map_err(|e| error(e.to_string()))
}
