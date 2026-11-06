// Sync previews carry a stricter identity than ordinary resumable transfers.
// A host/root/user change requires a new preview; legacy transfers stay unchanged.

fn sync_guard_error() -> AppError {
    transfer_error("SYNC_TARGET_CHANGED: Sync host or local directory changed; preview again")
}

async fn check_sync_path_ancestors(path: &Path) -> Result<(), AppError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(sync_guard_error());
    }
    // Include ancestors above the selected root: otherwise a junction such as
    // C:/link/chosen could silently resolve outside the originally selected tree.
    for ancestor in path.ancestors().collect::<Vec<_>>().into_iter().rev() {
        match tokio::fs::symlink_metadata(ancestor).await {
            Ok(metadata) => {
                if metadata.file_type().is_symlink()
                    || windows_reparse_rejection(ancestor, &metadata).is_some()
                {
                    return Err(transfer_error(format!(
                        "SYNC_UNSAFE_PATH: Sync does not follow symlinks or junctions: {}",
                        ancestor.display()
                    )));
                }
                if ancestor != path && !metadata.is_dir() {
                    return Err(transfer_error(
                        "SYNC_TYPE_CONFLICT: Parent path is not a directory",
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(transfer_error(error.to_string())),
        }
    }
    Ok(())
}

async fn capture_sync_local_root(root: &Path) -> Result<String, AppError> {
    check_sync_path_ancestors(root).await?;
    let metadata = tokio::fs::symlink_metadata(root).await.map_err(|error| {
        transfer_error(format!(
            "SYNC_LOCAL_ROOT: Select an existing local directory: {error}"
        ))
    })?;
    if !metadata.is_dir() {
        return Err(transfer_error("SYNC_LOCAL_ROOT: Select a local directory"));
    }
    tokio::fs::canonicalize(root)
        .await
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| transfer_error(error.to_string()))
}

async fn validate_sync_local_path(
    root: &Path,
    expected_root: &str,
    path: &Path,
) -> Result<(), AppError> {
    if !path.starts_with(root) || capture_sync_local_root(root).await? != expected_root {
        return Err(sync_guard_error());
    }
    check_sync_path_ancestors(path).await?;
    // For new files, resolve the deepest existing parent. A dangling leaf must
    // not let a replaced ancestor bypass the canonical-root boundary.
    let existing = path
        .ancestors()
        .find(|ancestor| ancestor.exists())
        .ok_or_else(sync_guard_error)?;
    let canonical = tokio::fs::canonicalize(existing)
        .await
        .map_err(|_| sync_guard_error())?;
    if !canonical.starts_with(Path::new(expected_root)) {
        return Err(sync_guard_error());
    }
    Ok(())
}

async fn validate_sync_guard(
    app: &AppHandle,
    tab_id: &str,
    guard: &SyncTargetGuard,
    local_path: Option<&Path>,
) -> Result<(), AppError> {
    if sync_binding(app, tab_id).await? != guard.binding {
        return Err(sync_guard_error());
    }
    validate_sync_local_path(
        Path::new(&guard.local_root),
        &guard.canonical_local_root,
        local_path.unwrap_or_else(|| Path::new(&guard.local_root)),
    )
    .await
}

async fn validate_sync_entry_guard(
    app: &AppHandle,
    tab_id: &str,
    direction: &str,
    entry: &TransferManifestEntry,
) -> Result<(), AppError> {
    let Some(version) = &entry.sync_destination else {
        return Ok(());
    };
    let guard = version.guard.as_ref().ok_or_else(sync_guard_error)?;
    let local_path = if direction == "upload" {
        &entry.source_path
    } else {
        &entry.destination_path
    };
    validate_sync_guard(app, tab_id, guard, Some(Path::new(local_path))).await?;
    if direction == "download" {
        validate_sync_local_path(
            Path::new(&guard.local_root),
            &guard.canonical_local_root,
            Path::new(&entry.partial_path),
        )
        .await?;
    }
    Ok(())
}

async fn validate_sync_manifest_guard(
    app: &AppHandle,
    tab_id: &str,
    direction: &str,
    manifest: &TransferManifest,
    directory: Option<&str>,
) -> Result<(), AppError> {
    let Some(version) = manifest
        .files
        .iter()
        .find_map(|entry| entry.sync_destination.as_ref())
    else {
        return Ok(());
    };
    let guard = version.guard.as_ref().ok_or_else(sync_guard_error)?;
    validate_sync_guard(
        app,
        tab_id,
        guard,
        if direction == "download" {
            directory.map(Path::new)
        } else {
            None
        },
    )
    .await
}

#[cfg(test)]
mod sync_guard_tests {
    use super::*;

    #[tokio::test]
    async fn sync_root_rejects_parent_escape_and_preserves_new_subdirectories() {
        let root = std::fs::canonicalize(std::env::temp_dir())
            .unwrap()
            .join(format!("termhub-sync-guard-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&root).await.unwrap();
        let canonical = capture_sync_local_root(&root).await.unwrap();
        assert!(
            validate_sync_local_path(&root, &canonical, &root.join("new/sub/file.txt"))
                .await
                .is_ok()
        );
        assert!(
            validate_sync_local_path(&root, &canonical, &root.join("../outside.txt"))
                .await
                .is_err()
        );
        assert!(
            validate_sync_local_path(&root, "different-root", &root.join("file.txt"))
                .await
                .is_err()
        );
        tokio::fs::remove_dir_all(&root).await.unwrap();
    }

    #[test]
    fn legacy_manifest_keeps_no_sync_guard_and_sync_guard_survives_journal() {
        let legacy: TransferManifestEntry = serde_json::from_value(serde_json::json!({"relativePath":"a","sourcePath":"a","destinationPath":"b","partialPath":"b.part","sourceIdentity":{"size":1},"status":"pending","transferredBytes":0})).unwrap();
        assert!(legacy.sync_destination.is_none());
        let guard = SyncTargetGuard {
            binding: "host-a:user:revision".into(),
            local_root: "root".into(),
            canonical_local_root: "canonical".into(),
        };
        let encoded = serde_json::to_value(&guard).unwrap();
        let decoded: SyncTargetGuard = serde_json::from_value(encoded).unwrap();
        assert_eq!(decoded.binding, guard.binding);
        assert_eq!(decoded.canonical_local_root, guard.canonical_local_root);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn sync_download_rejects_symlink_ancestor_even_when_leaf_does_not_exist() {
        let root = std::fs::canonicalize(std::env::temp_dir())
            .unwrap()
            .join(format!("termhub-sync-link-{}", uuid::Uuid::new_v4()));
        let outside = root.with_extension("outside");
        tokio::fs::create_dir_all(&root).await.unwrap();
        tokio::fs::create_dir_all(&outside).await.unwrap();
        let canonical = capture_sync_local_root(&root).await.unwrap();
        std::os::unix::fs::symlink(&outside, root.join("linked")).unwrap();
        assert!(
            validate_sync_local_path(&root, &canonical, &root.join("linked/new.txt"))
                .await
                .is_err()
        );
        tokio::fs::remove_file(root.join("linked")).await.unwrap();
        tokio::fs::remove_dir_all(&root).await.unwrap();
        tokio::fs::remove_dir_all(&outside).await.unwrap();
    }
}
