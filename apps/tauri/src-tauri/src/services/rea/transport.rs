use std::process::Stdio;
use std::sync::{Arc, Mutex};

use russh::{client::Msg, Channel, ChannelMsg};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use super::ReaClient;

// Tauri may return a Windows verbatim resource path. Node 24 rejects such an
// entry-point argument (EISDIR on the drive root), even though Windows launches
// the executable successfully. Preserve normal drive and UNC path semantics.
#[cfg(any(windows, test))]
fn node_entry_path(path: &std::path::Path) -> std::path::PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        std::path::PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        std::path::PathBuf::from(rest)
    } else {
        path.to_owned()
    }
}

pub async fn local_client(app: &AppHandle) -> Result<ReaClient, String> {
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    let development = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/rea");
    let runtime = [resources.join("rea"), development]
        .into_iter()
        .find(|p| p.join("node_modules/rea-agents/scripts/rea.mjs").is_file())
        .ok_or("REA_RUNTIME_MISSING: rebuild with npm run prepare:rea -w @transterm/tauri")?;
    let node = runtime.join(if cfg!(windows) { "node.exe" } else { "node" });
    let entry = runtime.join("node_modules/rea-agents/scripts/rea.mjs");
    #[cfg(windows)]
    let entry = node_entry_path(&entry);
    let mut command = Command::new(node);
    command
        .arg(entry)
        .arg("mcp")
        .env("REA_MCP_MAX_RESPONSE_BYTES", "16777216")
        .env("REA_MCP_OUTPUT_SCHEMA_PROFILE", "off")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let mut child = command.spawn().map_err(|e| format!("REA_RUNTIME: {e}"))?;
    let stdout = child.stdout.take().ok_or("REA_RUNTIME: missing stdout")?;
    let stdin = child.stdin.take().ok_or("REA_RUNTIME: missing stdin")?;
    let stderr = child.stderr.take().ok_or("REA_RUNTIME: missing stderr")?;
    let diagnostics = Arc::new(Mutex::new(String::new()));
    let errors = diagnostics.clone();
    let lifetime = CancellationToken::new();
    let monitor = lifetime.clone();
    tokio::spawn(async move {
        let drain = async {
            let mut stderr = stderr;
            let mut buffer = [0_u8; 4096];
            while let Ok(n) = stderr.read(&mut buffer).await {
                if n == 0 {
                    break;
                }
                append_diagnostics(&errors, &buffer[..n]);
            }
        };
        tokio::select! { _ = monitor.cancelled() => {}, _ = drain => {} }
    });
    let mut client = ReaClient::new(stdout, stdin, Some(child));
    client.set_transport(lifetime, diagnostics);
    Ok(client)
}

fn append_diagnostics(diagnostics: &Mutex<String>, data: &[u8]) {
    if let Ok(mut text) = diagnostics.lock() {
        text.push_str(&String::from_utf8_lossy(data));
        if text.len() > 8192 {
            let mut boundary = text.len() - 8192;
            while !text.is_char_boundary(boundary) {
                boundary += 1;
            }
            text.drain(..boundary);
        }
    }
}

#[cfg(test)]
pub fn ssh_client(channel: Channel<Msg>) -> ReaClient {
    ssh_client_with_progress(channel, None)
}

pub fn ssh_client_with_progress(
    mut channel: Channel<Msg>,
    progress: super::progress::ProgressReporter,
) -> ReaClient {
    let (client_stream, mut bridge_stream) = tokio::io::duplex(65536);
    let lifetime = CancellationToken::new();
    let monitor = lifetime.clone();
    let diagnostics = Arc::new(Mutex::new(String::new()));
    let errors = diagnostics.clone();
    tokio::spawn(async move {
        let pump = async {
            let mut input = [0_u8; 16384];
            let mut stages = super::progress::StageDecoder::default();
            loop {
                tokio::select! {
                    bytes = bridge_stream.read(&mut input) => {
                        let n = bytes.map_err(|e| e.to_string())?;
                        if n == 0 { break; }
                        channel.data(&input[..n]).await.map_err(|e| e.to_string())?;
                    }
                    message = channel.wait() => match message {
                        Some(ChannelMsg::Data { data }) => bridge_stream.write_all(&data).await.map_err(|e| e.to_string())?,
                        Some(ChannelMsg::ExtendedData { data, .. }) => {
                            stages.push(&data, &progress);
                            append_diagnostics(&errors, &data);
                        },
                        Some(ChannelMsg::ExitStatus { exit_status }) if exit_status != 0 => {
                            append_diagnostics(&errors, format!("\nREA remote exit: {exit_status}").as_bytes());
                            break;
                        }
                        Some(ChannelMsg::Eof | ChannelMsg::Close) | None => break,
                        _ => {}
                    }
                }
            }
            Ok::<(), String>(())
        };
        tokio::select! {
            _ = monitor.cancelled() => {},
            result = pump => { if let Err(e) = result { append_diagnostics(&errors, e.as_bytes()); } }
        }
        let _ = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            let _ = channel.eof().await;
            let _ = channel.close().await;
        })
        .await;
    });
    let (reader, writer) = tokio::io::split(client_stream);
    let mut client = ReaClient::new(reader, writer, None);
    client.set_transport(lifetime, diagnostics);
    client
}

#[cfg(test)]
mod tests {
    use super::node_entry_path;
    use std::path::{Path, PathBuf};

    #[test]
    fn node_entry_supports_tauri_verbatim_drive_and_unc_resources() {
        for (raw, expected) in [
            (
                r"\\?\D:\Program Files\transterm\rea\rea.mjs",
                r"D:\Program Files\transterm\rea\rea.mjs",
            ),
            (
                r"\\?\UNC\server\share\rea\rea.mjs",
                r"\\server\share\rea\rea.mjs",
            ),
            (r"D:\REA\rea.mjs", r"D:\REA\rea.mjs"),
        ] {
            assert_eq!(node_entry_path(Path::new(raw)), PathBuf::from(expected));
        }
    }
}
