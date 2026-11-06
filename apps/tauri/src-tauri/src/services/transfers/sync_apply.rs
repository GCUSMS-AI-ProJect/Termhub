fn sync_same_identity(
    current: Option<&TransferFileIdentity>,
    expected: Option<&TransferFileIdentity>,
) -> bool {
    match (current, expected) {
        (None, None) => true,
        (Some(a), Some(b)) => a.size == b.size && a.modified_at == b.modified_at,
        _ => false,
    }
}

pub async fn apply_directory_sync(
    app: &AppHandle,
    preview_id: &str,
    selected_paths: Vec<String>,
) -> Result<String, AppError> {
    let plan = SYNC_PREVIEWS
        .lock()
        .map_err(|_| transfer_error("Sync preview lock unavailable"))?
        .remove(preview_id)
        .ok_or_else(|| {
            transfer_error("SYNC_PREVIEW_EXPIRED: Preview again before synchronizing")
        })?;
    if now_ms().saturating_sub(plan.created_at) > 10 * 60 * 1000 {
        return Err(transfer_error(
            "SYNC_PREVIEW_EXPIRED: Preview again before synchronizing",
        ));
    }
    if selected_paths.is_empty() || selected_paths.len() > 10_000 {
        return Err(transfer_error(
            "SYNC_SELECTION_EMPTY: Select files to synchronize",
        ));
    }
    let selected = selected_paths.into_iter().collect::<HashSet<_>>();
    let entries = plan
        .entries
        .iter()
        .filter(|entry| selected.contains(&entry.path))
        .collect::<Vec<_>>();
    if entries.len() != selected.len() {
        return Err(transfer_error(
            "SYNC_SELECTION_INVALID: Selection is not part of this preview",
        ));
    }
    let input = &plan.input;
    let guard = SyncTargetGuard {
        binding: plan.binding.clone(),
        local_root: input.local_directory.clone(),
        canonical_local_root: plan.canonical_local_root.clone(),
    };
    if sync_binding(app, &input.tab_id).await? != plan.binding {
        return Err(transfer_error(
            "SYNC_TARGET_CHANGED: Reconnect and preview again",
        ));
    }
    let mut manifest_files = Vec::new();
    let mut directories = std::collections::BTreeSet::new();
    let destination_root = if input.direction == "upload" {
        input.remote_directory.clone()
    } else {
        input.local_directory.clone()
    };
    directories.insert(destination_root.clone());
    let state = app.state::<crate::services::workspace::WorkspaceState>();
    let tab = state
        .tabs
        .read()
        .await
        .iter()
        .find(|tab| tab.id == input.tab_id)
        .cloned()
        .ok_or_else(|| transfer_error("SYNC_TARGET_CHANGED: Session closed"))?;
    let file_access_mode = state
        .sessions
        .read()
        .await
        .get(&input.tab_id)
        .map(|session| session.file_access_mode.clone())
        .unwrap_or_else(|| "user".into());
    for entry in entries {
        let local_path = Path::new(&input.local_directory).join(&entry.path);
        validate_sync_guard(app, &input.tab_id, &guard, Some(&local_path)).await?;
        let remote_path = join_remote_path(&input.remote_directory, &entry.path);
        let local = sync_local_identity(&local_path).await?;
        let remote = sync_remote_identity(app, &input.tab_id, remote_path.clone()).await?;
        let (source, destination) = if input.direction == "upload" {
            (local, remote)
        } else {
            (remote, local)
        };
        if !sync_same_identity(source.as_ref(), entry.source_identity.as_ref())
            || !sync_same_identity(destination.as_ref(), entry.destination_identity.as_ref())
        {
            return Err(transfer_error(format!(
                "SYNC_FILE_CHANGED: {} changed after preview; preview again",
                entry.path
            )));
        }
        let source_identity = source.ok_or_else(|| transfer_error("SYNC_SOURCE_MISSING"))?;
        let (source_path, destination_path) = if input.direction == "upload" {
            (local_path.to_string_lossy().into_owned(), remote_path)
        } else {
            (remote_path, local_path.to_string_lossy().into_owned())
        };
        let parts = entry.path.split('/').collect::<Vec<_>>();
        for end in 1..parts.len() {
            let relative = parts[..end].join("/");
            directories.insert(if input.direction == "upload" {
                join_remote_path(&destination_root, &relative)
            } else {
                Path::new(&destination_root)
                    .join(relative)
                    .to_string_lossy()
                    .into_owned()
            });
        }
        manifest_files.push(TransferManifestEntry {
            sync_destination: Some(SyncDestinationVersion {
                guard: Some(guard.clone()),
                exists: entry.destination_identity.is_some(),
                size: entry.destination_identity.as_ref().map(|value| value.size),
                modified_at: entry
                    .destination_identity
                    .as_ref()
                    .and_then(|value| value.modified_at),
            }),
            relative_path: entry.path.clone(),
            source_path,
            partial_path: partial_path(&destination_path),
            staging_path: (input.direction == "upload" && file_access_mode == "root")
                .then(|| root_staging_path(&entry.path)),
            destination_path,
            source_identity,
            status: "pending".into(),
            transferred_bytes: 0,
        });
    }
    if sync_binding(app, &input.tab_id).await? != plan.binding {
        return Err(transfer_error(
            "SYNC_TARGET_CHANGED: Session changed while validating",
        ));
    }
    ensure_loaded(app).await?;
    let _lifecycle = state.transfer_lifecycle.lock().await;
    let manifest = TransferManifest {
        version: 1,
        directories: directories.into_iter().collect(),
        files: manifest_files,
    };
    let (_, total) = manifest_totals(&manifest);
    let id = format!("transfer-{}", uuid::Uuid::new_v4());
    let task = TransferTask {
        id: id.clone(),
        direction: input.direction.clone(),
        name: format!("Sync · {}", task_name(&input.local_directory)),
        progress: 0.0,
        status: "queued".into(),
        message: Some("等待同步选中文件".into()),
        speed: None,
        transferred_bytes: Some(0),
        total_bytes: Some(total),
        tab_id: Some(input.tab_id.clone()),
        profile_id: Some(tab.profile_id),
        session_type: Some(tab.session_type),
        file_access_mode: Some(file_access_mode),
        target_type: Some("folder".into()),
        source_path: Some(if input.direction == "upload" {
            input.local_directory.clone()
        } else {
            input.remote_directory.clone()
        }),
        destination_path: Some(destination_root),
        partial_path: None,
        staging_path: None,
        source_identity: None,
        manifest: Some(manifest),
        resumable: true,
        retry_attempt: None,
        cleanup_pending: false,
        created_at: Some(now_ms()),
        updated_at: Some(now_ms()),
    };
    state.transfers.write().await.push(task.clone());
    persist(app).await?;
    emit_task(app, &task).await;
    start(app.clone(), id.clone()).await?;
    Ok(id)
}

async fn validate_sync_destination(
    app: &AppHandle,
    tab_id: &str,
    direction: &str,
    entry: &TransferManifestEntry,
) -> Result<(), AppError> {
    let Some(expected) = &entry.sync_destination else {
        return Ok(());
    };
    validate_sync_entry_guard(app, tab_id, direction, entry).await?;
    let current = if direction == "upload" {
        sync_remote_identity(app, tab_id, entry.destination_path.clone()).await?
    } else {
        sync_local_identity(Path::new(&entry.destination_path)).await?
    };
    if expected.exists != current.is_some()
        || expected.size != current.as_ref().map(|value| value.size)
        || expected.modified_at != current.as_ref().and_then(|value| value.modified_at)
    {
        return Err(transfer_error(format!(
            "SYNC_FILE_CHANGED: {} changed after preview; preview again",
            entry.relative_path
        )));
    }
    Ok(())
}

#[cfg(test)]
mod sync_tests {
    use super::*;
    #[test]
    fn sync_ignores_directory_names_and_relative_globs_without_substring_matches() {
        let patterns = vec![
            ".git".into(),
            "node_modules".into(),
            "*.log".into(),
            "build/**".into(),
        ];
        for path in [
            ".git/config",
            "src/node_modules/pkg/index.js",
            "logs/a.log",
            "build/assets/a.js",
        ] {
            assert!(sync_ignored(path, &patterns), "{path}");
        }
        for path in [
            ".github/workflow.yml",
            "src/node_modules_backup/x",
            "src/index.ts",
        ] {
            assert!(!sync_ignored(path, &patterns), "{path}");
        }
    }
    #[test]
    fn sync_never_marks_equal_size_with_unknown_timestamp_as_unchanged() {
        let source = TransferFileIdentity {
            size: 20,
            modified_at: Some(1000),
        };
        assert_eq!(sync_status(&source, None), "new");
        assert_eq!(
            sync_status(
                &source,
                Some(&TransferFileIdentity {
                    size: 20,
                    modified_at: None
                })
            ),
            "modified"
        );
        assert_eq!(
            sync_status(
                &source,
                Some(&TransferFileIdentity {
                    size: 20,
                    modified_at: Some(1500)
                })
            ),
            "unchanged"
        );
        assert!(!sync_same_identity(
            Some(&source),
            Some(&TransferFileIdentity {
                size: 20,
                modified_at: Some(1500)
            })
        ));
        assert!(!sync_same_identity(None, Some(&source)));
    }
    #[tokio::test]
    async fn sync_filter_prunes_ignored_subtrees_and_preserves_the_regular_upload_scan() {
        let root = std::env::temp_dir().join(format!("termhub-sync-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(root.join("node_modules/pkg"))
            .await
            .unwrap();
        tokio::fs::write(root.join("node_modules/pkg/dependency.js"), "dependency")
            .await
            .unwrap();
        tokio::fs::write(root.join("main.ts"), "main")
            .await
            .unwrap();
        assert_eq!(
            collect_local_tree_filtered(&root, &["node_modules".into()])
                .await
                .unwrap()
                .1
                .len(),
            1
        );
        assert_eq!(collect_local_tree(&root).await.unwrap().1.len(), 2);
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
