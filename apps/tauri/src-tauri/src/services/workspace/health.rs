use super::WorkspaceState;
use serde_json::{json, Value};

/// Enrich the existing minute report without another IPC request or a waiting task.
pub fn augment_renderer_health(state: &WorkspaceState, message: &str) -> Option<String> {
    if message.len() > 16 * 1024 {
        return None;
    }
    let mut report: Value = serde_json::from_str(message).ok()?;
    if report.get("event")?.as_str()? != "renderer-health" {
        return None;
    }
    let runtime = tauri::async_runtime::handle().inner().metrics();
    let workers = state.workers.try_read().ok();
    report["native"] = json!({
        "tokioAliveTasks": runtime.num_alive_tasks(),
        "tokioGlobalQueueDepth": runtime.global_queue_depth(),
        "sessions": state.sessions.try_read().ok().map(|items| items.len()),
        "workers": workers.as_ref().map(|items| items.len()),
        "workerQueuedCommands": workers.as_ref().map(|items| items.values()
            .map(|sender| sender.max_capacity() - sender.capacity()).sum::<usize>()),
        "sessionLogWriters": state.session_log_writers.try_read().ok().map(|items| items.len()),
        "transferTasks": state.transfers.try_read().ok().map(|items| items.len()),
        "transferRuns": state.transfer_runs.try_read().ok().map(|items| items.len()),
        "transferProgressSamples": state.transfer_progress_samples.try_lock().ok().map(|items| items.len()),
        "terminalOutput": state.terminal_output_health(),
    });
    serde_json::to_string(&report).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_minute_health_reports_collect_runtime_counts() {
        let state = WorkspaceState::default();
        assert!(augment_renderer_health(&state, "not json").is_none());
        assert!(augment_renderer_health(&state, r#"{"event":"event-loop-gap"}"#).is_none());
        assert!(augment_renderer_health(&state, &" ".repeat(16385)).is_none());
        let _busy = state.transfers.try_write().unwrap();
        let report =
            augment_renderer_health(&state, r#"{"event":"renderer-health","uptimeMs":60000}"#)
                .unwrap();
        let report: Value = serde_json::from_str(&report).unwrap();
        assert_eq!(report["uptimeMs"], 60000);
        assert_eq!(report["native"]["sessions"], 0);
        assert_eq!(report["native"]["workerQueuedCommands"], 0);
        assert!(
            report["native"]["transferTasks"].is_null(),
            "busy locks must not wait or report zero"
        );
        assert!(report["native"]["tokioAliveTasks"].is_number());
    }
}
