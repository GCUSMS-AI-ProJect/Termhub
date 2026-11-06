//! Version-checked text edits and bounded local recovery copies.
use crate::{storage::workspace_file, AppError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, LazyLock, Mutex, Weak},
};
use tauri::{AppHandle, Manager};

const MAX_TEXT_BYTES: usize = 16 * 1024 * 1024;
static FILE_LOCKS: LazyLock<Mutex<HashMap<String, Weak<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTarget {
    pub source: String,
    pub path: String,
    pub tab_id: Option<String>,
    pub encoding: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionedFile {
    pub target: FileTarget,
    pub content: String,
    pub revision: String,
    pub binding: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileChangeInput {
    pub target: FileTarget,
    pub expected_revision: String,
    pub expected_binding: String,
    pub content: String,
    pub encoding: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFileChange {
    pub file: VersionedFile,
    pub change_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryRecord {
    id: String,
    before: VersionedFile,
    after_content: String,
    after_encoding: Option<String>,
    created_at: u64,
}

fn error(message: impl Into<String>) -> AppError {
    AppError::Command(message.into())
}
fn digest(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

fn validate_target(target: &FileTarget) -> Result<(), AppError> {
    if target.path.is_empty()
        || target.path.len() > 4096
        || target.path.chars().any(char::is_control)
    {
        return Err(error("FILE_TARGET_INVALID: Invalid file path"));
    }
    match target.source.as_str() {
        "local" if Path::new(&target.path).is_absolute() => Ok(()),
        "remote"
            if target.tab_id.as_deref().is_some_and(|id| !id.is_empty())
                && target.path.starts_with('/') =>
        {
            Ok(())
        }
        _ => Err(error(
            "FILE_TARGET_INVALID: Choose a local or connected remote file",
        )),
    }
}

fn file_lock(target: &FileTarget) -> Result<Arc<tokio::sync::Mutex<()>>, AppError> {
    let path = if target.source == "local" {
        std::fs::canonicalize(&target.path)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| target.path.clone())
    } else {
        target.path.clone()
    };
    let key = format!("{}:{:?}:{path}", target.source, target.tab_id);
    let mut locks = FILE_LOCKS
        .lock()
        .map_err(|_| error("File edit lock unavailable"))?;
    locks.retain(|_, value| value.strong_count() > 0);
    if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    let lock = Arc::new(tokio::sync::Mutex::new(()));
    locks.insert(key, Arc::downgrade(&lock));
    Ok(lock)
}

async fn binding(app: &AppHandle, target: &FileTarget) -> Result<String, AppError> {
    validate_target(target)?;
    if target.source == "local" {
        let path = std::fs::canonicalize(&target.path)
            .map_err(|e| error(format!("FILE_UNAVAILABLE: {e}")))?;
        if !path.is_file() {
            return Err(error("FILE_TARGET_INVALID: Target is not a file"));
        }
        return Ok(digest(&path.to_string_lossy()));
    }
    let tab_id = target.tab_id.as_deref().unwrap_or_default();
    let state = app.state::<crate::services::workspace::WorkspaceState>();
    let revision = state.ai_session_revision(tab_id).await;
    let tabs = state.tabs.read().await;
    let tab = tabs
        .iter()
        .find(|tab| tab.id == tab_id)
        .ok_or_else(|| error("FILE_TARGET_CHANGED: Session was closed"))?;
    let sessions = state.sessions.read().await;
    let session = sessions
        .get(tab_id)
        .filter(|s| s.connected && s.capabilities.files)
        .ok_or_else(|| error("FILE_TARGET_CHANGED: File channel is unavailable"))?;
    Ok(digest(&format!(
        "{}:{}:{}:{}:{revision}",
        tab.profile_id, tab.session_type, session.access_host, session.file_access_mode
    )))
}

pub async fn read(app: &AppHandle, target: FileTarget) -> Result<VersionedFile, AppError> {
    let before_binding = binding(app, &target).await?;
    let content = if target.source == "local" {
        let metadata = std::fs::metadata(&target.path).map_err(|e| error(e.to_string()))?;
        if metadata.len() > MAX_TEXT_BYTES as u64 {
            return Err(error("FILE_TOO_LARGE: Text file exceeds 16 MiB"));
        }
        let bytes = std::fs::read(&target.path).map_err(|e| error(e.to_string()))?;
        if bytes.len() > MAX_TEXT_BYTES {
            return Err(error("FILE_TOO_LARGE: Text file exceeds 16 MiB"));
        }
        decode_local_text(&bytes, target.encoding.as_deref())?
    } else {
        let stat = crate::commands::send_worker_cmd_with_response_timeout(
            app,
            target.tab_id.as_deref().unwrap_or_default(),
            std::time::Duration::from_secs(30),
            |respond_to| crate::sessions::WorkerCmd::StatRemoteFile {
                path: target.path.clone(),
                cancellation: tokio_util::sync::CancellationToken::new(),
                respond_to,
            },
        )
        .await?
        .ok_or_else(|| error("FILE_UNAVAILABLE: Remote file does not exist"))?;
        if stat.size > MAX_TEXT_BYTES as u64 {
            return Err(error("FILE_TOO_LARGE: Text file exceeds 16 MiB"));
        }
        crate::commands::app_read_remote_file(
            app.clone(),
            target.tab_id.clone().unwrap_or_default(),
            target.path.clone(),
            target.encoding.clone(),
        )
        .await?
    };
    if content.len() > MAX_TEXT_BYTES {
        return Err(error("FILE_TOO_LARGE: Text file exceeds 16 MiB"));
    }
    if binding(app, &target).await? != before_binding {
        return Err(error("FILE_TARGET_CHANGED: Session changed while reading"));
    }
    Ok(VersionedFile {
        revision: digest(&content),
        target,
        content,
        binding: before_binding,
    })
}

fn compare_version(
    current: &VersionedFile,
    expected_revision: &str,
    expected_binding: &str,
) -> Result<(), AppError> {
    if current.binding != expected_binding {
        return Err(error(
            "FILE_TARGET_CHANGED: File target changed; reload before saving",
        ));
    }
    if current.revision != expected_revision {
        return Err(error(
            "FILE_CONFLICT: File changed since it was opened; compare changes before saving",
        ));
    }
    Ok(())
}

pub async fn save(
    app: &AppHandle,
    input: SaveFileChangeInput,
) -> Result<SavedFileChange, AppError> {
    validate_target(&input.target)?;
    if input.content.len() > MAX_TEXT_BYTES {
        return Err(error("FILE_TOO_LARGE: Text file exceeds 16 MiB"));
    }
    let lock = file_lock(&input.target)?;
    let _guard = lock.lock().await;
    let current = read(app, input.target.clone()).await?;
    compare_version(&current, &input.expected_revision, &input.expected_binding)?;
    let encoding = input.encoding.or_else(|| input.target.encoding.clone());
    let local_bytes = if input.target.source == "local" {
        Some(encode_local_text(&input.content, encoding.as_deref())?)
    } else {
        None
    };
    let change_id = format!("file-change-{}", uuid::Uuid::new_v4());
    let record = RecoveryRecord {
        id: change_id.clone(),
        before: current.clone(),
        after_content: input.content.clone(),
        after_encoding: encoding.clone(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    };
    persist_recovery(app, &record)?;
    // Revalidate after making the backup. A remote protocol has no universal CAS;
    // this detects edits up to the final read while keeping existing protocol clients.
    let latest = read(app, input.target.clone()).await?;
    compare_version(&latest, &input.expected_revision, &input.expected_binding)?;
    if let Some(bytes) = local_bytes {
        std::fs::write(&input.target.path, bytes).map_err(|e| error(e.to_string()))?;
    } else {
        crate::commands::app_write_remote_file(
            app.clone(),
            input.target.tab_id.clone().unwrap_or_default(),
            input.target.path.clone(),
            input.content,
            encoding.clone(),
        )
        .await?;
    }
    let file = read(
        app,
        FileTarget {
            encoding,
            ..input.target
        },
    )
    .await?;
    Ok(SavedFileChange { file, change_id })
}

pub async fn undo(app: &AppHandle, change_id: &str) -> Result<SavedFileChange, AppError> {
    let record = read_recovery(app, change_id)?;
    let target = FileTarget {
        encoding: record.after_encoding.clone(),
        ..record.before.target.clone()
    };
    save(
        app,
        SaveFileChangeInput {
            target,
            expected_revision: digest(&record.after_content),
            expected_binding: record.before.binding,
            content: record.before.content,
            encoding: record.before.target.encoding,
        },
    )
    .await
}

include!("recovery.rs");
include!("text_encoding.rs");
#[cfg(test)]
mod tests;
