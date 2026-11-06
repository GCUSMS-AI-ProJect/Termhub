use crate::{services::workspace::WorkspaceState, AppError};
use base64::Engine;
use tauri::{AppHandle, Manager};

const MAX_IMAGE_BYTES: usize = 64 * 1024 * 1024;
#[cfg(windows)]
mod windows_clipboard_image;

fn save_image(
    image: arboard::ImageData<'_>,
    directory: &std::path::Path,
) -> Result<std::path::PathBuf, AppError> {
    let width = u32::try_from(image.width).unwrap_or(0);
    let height = u32::try_from(image.height).unwrap_or(0);
    let expected = image
        .width
        .checked_mul(image.height)
        .and_then(|n| n.checked_mul(4));
    if width == 0
        || height == 0
        || expected != Some(image.bytes.len())
        || image.bytes.len() > MAX_IMAGE_BYTES
    {
        return Err(AppError::Clipboard(
            "Clipboard image is invalid or exceeds 64 MiB".into(),
        ));
    }
    std::fs::create_dir_all(directory).map_err(|e| AppError::Clipboard(e.to_string()))?;
    let path = directory.join(format!("screenshot-{}.png", uuid::Uuid::new_v4()));
    image::save_buffer_with_format(
        &path,
        image.bytes.as_ref(),
        width,
        height,
        image::ColorType::Rgba8,
        image::ImageFormat::Png,
    )
    .map_err(|e| AppError::Clipboard(e.to_string()))?;
    Ok(path)
}

fn quote_path(path: &str, windows: bool) -> String {
    if windows {
        format!("\"{}\" ", path.replace('\\', "/"))
    } else {
        format!("'{}' ", path.replace('\'', "'\\''"))
    }
}

fn remote_image_command(bytes: usize) -> String {
    // Fixed shell program; image bytes travel only through SSH stdin.
    format!("sh -c 'set -eu; umask 077; dir=$(mktemp -d /tmp/termhub-clipboard.XXXXXXXX); path=\"$dir/image.png\"; if base64 -d > \"$path\" && [ \"$(wc -c < \"$path\")\" -eq {bytes} ]; then printf \"__TERMHUB_CLIPBOARD__=%s\\n\" \"$path\"; else rm -f \"$path\"; rmdir \"$dir\"; exit 1; fi'")
}

fn remote_image_path(result: &serde_json::Value) -> Result<String, AppError> {
    if result.get("exitCode").and_then(|value| value.as_i64()) != Some(0)
        || result
            .get("timedOut")
            .and_then(|value| value.as_bool())
            .unwrap_or(false)
        || result
            .get("outputTruncated")
            .and_then(|value| value.as_bool())
            .unwrap_or(false)
    {
        return Err(AppError::Clipboard(
            "SSH image upload failed or timed out".into(),
        ));
    }
    let path = result
        .get("output")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .lines()
        .find_map(|line| line.trim().strip_prefix("__TERMHUB_CLIPBOARD__="))
        .ok_or_else(|| AppError::Clipboard("SSH image upload returned no confirmed path".into()))?;
    let valid = path
        .strip_prefix("/tmp/termhub-clipboard.")
        .and_then(|tail| tail.strip_suffix("/image.png"))
        .is_some_and(|suffix| {
            suffix.len() == 8 && suffix.bytes().all(|byte| byte.is_ascii_alphanumeric())
        });
    if !valid {
        return Err(AppError::Clipboard(
            "SSH image upload returned an invalid path".into(),
        ));
    }
    Ok(quote_path(path, false))
}

#[tauri::command]
pub async fn app_prepare_terminal_image_paste(
    app: AppHandle,
    tab_id: String,
) -> Result<Option<String>, AppError> {
    crate::services::logging::info(
        &app,
        "clipboard",
        format!("image paste requested tab_id={tab_id}"),
    );
    let state = app.state::<WorkspaceState>();
    let session_type = state
        .tabs
        .read()
        .await
        .iter()
        .find(|tab| tab.id == tab_id)
        .map(|tab| tab.session_type.clone())
        .ok_or_else(|| AppError::Command("Terminal no longer exists".into()))?;
    let session = state
        .sessions
        .read()
        .await
        .get(&tab_id)
        .cloned()
        .ok_or_else(|| AppError::Command("Terminal session is unavailable".into()))?;
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Clipboard(e.to_string()))?
        .join("terminal-images");
    let local_path = tauri::async_runtime::spawn_blocking(move || {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
        let image_result = clipboard.get_image();
        #[cfg(windows)]
        let image_result = match image_result {
            Ok(image) => Ok(image),
            Err(original) => {
                windows_clipboard_image::read_image(MAX_IMAGE_BYTES).map_err(|_| original)
            }
        };
        let image = match image_result {
            Ok(image) => image,
            Err(arboard::Error::ContentNotAvailable) => return Ok(None),
            Err(error) => return Err(AppError::Clipboard(error.to_string())),
        };
        save_image(image, &directory).map(Some)
    })
    .await
    .map_err(|e| AppError::Clipboard(e.to_string()))??;
    let Some(local_path) = local_path else {
        crate::services::logging::info(&app, "clipboard", "no native clipboard image");
        return Ok(None);
    };
    crate::services::logging::info(
        &app,
        "clipboard",
        "native image saved; preparing target transfer",
    );
    let unchanged = state
        .sessions
        .read()
        .await
        .get(&tab_id)
        .is_some_and(|current| {
            current.connected
                && current.ai_session_revision == session.ai_session_revision
                && current.profile_id == session.profile_id
                && current.file_access_mode == session.file_access_mode
        });
    if !unchanged {
        let _ = std::fs::remove_file(&local_path);
        return Err(AppError::Command(
            "Terminal changed during image paste; please retry".into(),
        ));
    }
    if session_type == "local" {
        return Ok(Some(quote_path(
            &local_path.to_string_lossy(),
            cfg!(windows),
        )));
    }
    if session_type != "ssh"
        || !session.connected
        || session.device_mode.as_deref() == Some("network-device")
    {
        let _ = std::fs::remove_file(&local_path);
        return Err(AppError::Command(
            "Image paste requires a local terminal or an SSH server session".into(),
        ));
    }
    let bytes = tokio::fs::read(&local_path).await;
    let _ = tokio::fs::remove_file(&local_path).await;
    let bytes = bytes.map_err(|error| AppError::Clipboard(error.to_string()))?;
    let command = remote_image_command(bytes.len());
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let result = super::send_worker_file_cmd_with_response_timeout(
        &app,
        &tab_id,
        std::time::Duration::from_secs(70),
        |respond_to, cancel| crate::sessions::WorkerCmd::ExecuteRemoteCommand {
            command,
            cwd: None,
            timeout_ms: 60_000,
            stdin: Some(encoded),
            request_pty: false,
            cancellation: Some(cancel),
            respond_to,
        },
    )
    .await?;
    crate::services::logging::info(
        &app,
        "clipboard",
        format!(
            "SSH image transfer completed exit_code={:?} timed_out={:?}",
            result.get("exitCode"),
            result.get("timedOut")
        ),
    );
    if !state
        .sessions
        .read()
        .await
        .get(&tab_id)
        .is_some_and(|current| {
            current.connected
                && current.ai_session_revision == session.ai_session_revision
                && current.profile_id == session.profile_id
                && current.file_access_mode == session.file_access_mode
        })
    {
        return Err(AppError::Command(
            "Terminal changed during image upload; path was not pasted".into(),
        ));
    }
    remote_image_path(&result).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_upload_only_accepts_a_confirmed_private_shell_path() {
        let success = serde_json::json!({"exitCode":0,"output":"banner\n__TERMHUB_CLIPBOARD__=/tmp/termhub-clipboard.aB123456/image.png\n"});
        assert_eq!(
            remote_image_path(&success).unwrap(),
            "'/tmp/termhub-clipboard.aB123456/image.png' "
        );
        for value in [
            serde_json::json!({"exitCode":1,"output":"permission denied"}),
            serde_json::json!({"exitCode":0,"timedOut":true,"output":""}),
            serde_json::json!({"exitCode":0,"output":"__TERMHUB_CLIPBOARD__=/tmp/../../other.png"}),
            serde_json::json!({"exitCode":0,"output":"unconfirmed path"}),
        ] {
            assert!(remote_image_path(&value).is_err());
        }
        let command = remote_image_command(123);
        assert!(command.contains("-eq 123"));
        assert!(!command.contains("sftp"));
    }
    #[test]
    fn saves_valid_png_and_rejects_invalid_dimensions() {
        let directory =
            std::env::temp_dir().join(format!("termhub-image-test-{}", uuid::Uuid::new_v4()));
        let image = arboard::ImageData {
            width: 1,
            height: 1,
            bytes: std::borrow::Cow::Owned(vec![255, 0, 0, 255]),
        };
        let path = save_image(image, &directory).unwrap();
        assert!(path.exists());
        assert_eq!(
            quote_path("/home/a'b/pic.png", false),
            "'/home/a'\\''b/pic.png' "
        );
        let files: Vec<_> = std::fs::read_dir(&directory).unwrap().collect();
        assert_eq!(files.len(), 1);
        let decoded = image::open(files[0].as_ref().unwrap().path()).unwrap();
        assert_eq!(decoded.to_rgba8().as_raw(), &[255, 0, 0, 255]);
        let invalid = arboard::ImageData {
            width: usize::MAX,
            height: 2,
            bytes: std::borrow::Cow::Owned(vec![]),
        };
        assert!(save_image(invalid, &directory).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
