//! REA is a local stdio service or a stdio service carried by an existing SSH channel.
pub mod client;
mod environment;
pub mod progress;
#[cfg(test)]
mod ssh_tests;
#[cfg(test)]
mod tests;
mod transport;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use crate::{services::workspace::WorkspaceState, AppError};
pub use client::ReaClient;
pub use environment::ReaEngineStatus;
use progress::{report, ProgressReporter, ReaPreparationStage};
pub const VERSION: &str = "6.7.0";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaStatus {
    pub ready: bool,
    pub version: String,
    pub target: String,
    pub tool_count: usize,
    pub server: Value,
    pub message: String,
    pub engines: Vec<ReaEngineStatus>,
}

/// Check the authoritative target, not a renderer-supplied host or executable.
pub async fn connect(
    app: &AppHandle,
    tab_id: &str,
    expected_revision: &str,
    cancellation: &CancellationToken,
) -> Result<ReaClient, AppError> {
    connect_with_progress(app, tab_id, expected_revision, cancellation, None).await
}

async fn connect_with_progress(
    app: &AppHandle,
    tab_id: &str,
    expected_revision: &str,
    cancellation: &CancellationToken,
    progress: ProgressReporter,
) -> Result<ReaClient, AppError> {
    let state = app.state::<WorkspaceState>();
    let session_type = {
        let tabs = state.tabs.read().await;
        tabs.iter()
            .find(|tab| tab.id == tab_id && tab.status.is_connected())
            .map(|tab| tab.session_type.clone())
            .ok_or_else(|| {
                AppError::Command("REA_TARGET_CHANGED: terminal is not connected".into())
            })?
    };
    {
        let sessions = state.sessions.read().await;
        let session = sessions
            .get(tab_id)
            .ok_or_else(|| AppError::Command("REA_TARGET_CHANGED".into()))?;
        if !session.connected || session.device_mode.as_deref() == Some("network-device") {
            return Err(AppError::Command(
                "REA_UNSUPPORTED: select a local terminal or a POSIX SSH server".into(),
            ));
        }
        if session_type == "ssh" && !session.capabilities.shell_integration {
            return Err(AppError::Command(
                "REA_UNSUPPORTED: SSH exec is disabled".into(),
            ));
        }
    }
    if state.ai_session_revision(tab_id).await.to_string() != expected_revision {
        return Err(AppError::Command(
            "REA_TARGET_CHANGED: reconnect the analysis target".into(),
        ));
    }
    let mut client = match session_type.as_str() {
        "local" => {
            report(&progress, ReaPreparationStage::Starting);
            transport::local_client(app).await
        }
        "ssh" => {
            report(&progress, ReaPreparationStage::CheckingRuntime);
            let script = include_str!("remote-launch.sh");
            let command = format!(
                "sh -c '{}'",
                script.replace('\r', "").replace('\'', "'\"'\"'")
            );
            let channel = crate::commands::send_worker_cmd_with_response_timeout_cancellable(
                app,
                tab_id,
                std::time::Duration::from_secs(20),
                Some(cancellation),
                |respond_to| crate::sessions::WorkerCmd::OpenReaChannel {
                    command,
                    respond_to,
                },
            )
            .await?;
            Ok(transport::ssh_client_with_progress(channel, progress))
        }
        _ => Err("REA_UNSUPPORTED: only local and SSH terminals are supported".into()),
    }
    .map_err(AppError::Command)?;
    if let Err(error) = client.initialize(cancellation).await {
        let diagnostics = client.diagnostics();
        client.close().await;
        return Err(AppError::Command(format!("{error}\n{diagnostics}")));
    }
    // Reconnects while npm is preparing the remote package invalidate the result.
    if state.ai_session_revision(tab_id).await.to_string() != expected_revision {
        client.close().await;
        return Err(AppError::Command("REA_TARGET_CHANGED".into()));
    }
    Ok(client)
}

pub async fn check(
    app: &AppHandle,
    tab_id: &str,
    revision: &str,
    cancellation: &CancellationToken,
    progress: ProgressReporter,
) -> Result<ReaStatus, AppError> {
    let mut client =
        connect_with_progress(app, tab_id, revision, cancellation, progress.clone()).await?;
    report(&progress, ReaPreparationStage::CheckingEngines);
    let engines = environment::check_engines(&mut client, cancellation).await;
    let result = ReaStatus {
        ready: true,
        version: VERSION.into(),
        target: tab_id.into(),
        tool_count: client.tools.len(),
        server: client.server.clone(),
        message:
            "REA connected. Individual analysis tools may require an installed analysis engine."
                .into(),
        engines,
    };
    client.close().await;
    report(&progress, ReaPreparationStage::Ready);
    Ok(result)
}
