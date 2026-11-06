/// Start the bounded terminal output pump used by the SSH worker loop.
///
/// The worker only performs a non-blocking `try_send`; this task owns the
/// renderer-facing async emit so terminal input and command dispatch stay
/// responsive while a remote process produces a large amount of output.
fn spawn_terminal_output_pump(app: &AppHandle, tab_id: &str) -> TerminalOutputPump {
    let (terminal_output_tx, mut terminal_output_rx) = mpsc::channel::<String>(128);
    let pump_app = app.clone();
    let pump_tab_id = tab_id.to_string();
    tokio::spawn(async move {
        while let Some(chunk) = terminal_output_rx.recv().await {
            crate::sessions::terminal::emit_terminal_data(&pump_app, &pump_tab_id, &chunk).await;
        }
        let state = pump_app.state::<crate::services::workspace::WorkspaceState>();
        if !state.sessions.read().await.contains_key(&pump_tab_id) {
            // A closing worker can drain its final output after the tab was removed.
            state.forget_terminal_output_tab(&pump_tab_id);
        }
    });

    TerminalOutputPump {
        sender: terminal_output_tx,
        skipped_bytes: 0,
        last_warning: None,
    }
}

struct TerminalOutputPump {
    sender: mpsc::Sender<String>,
    skipped_bytes: usize,
    last_warning: Option<Instant>,
}

impl TerminalOutputPump {
    fn enqueue(&mut self, batch: &mut Vec<u8>) -> Option<usize> {
        if batch.is_empty() {
            return None;
        }
        let bytes = batch.len();
        let text = String::from_utf8_lossy(batch);
        let chunk = if self.skipped_bytes == 0 {
            text.into_owned()
        } else {
            format!("\x18\x1b[0m\r\n[transterm: terminal display skipped {} bytes while busy; press Ctrl+L to redraw]\r\n{text}", self.skipped_bytes)
        };
        batch.clear();
        match self.sender.try_send(chunk) {
            Ok(()) => self.skipped_bytes = 0,
            Err(mpsc::error::TrySendError::Full(_)) => {
                // shortcut: preserve shared SSH IO by skipping display batches; upgrade with per-channel receive credit.
                self.skipped_bytes = self.skipped_bytes.saturating_add(bytes);
                if self
                    .last_warning
                    .is_none_or(|last| last.elapsed() >= Duration::from_secs(30))
                {
                    self.last_warning = Some(Instant::now());
                    return Some(self.skipped_bytes);
                }
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {}
        }
        None
    }
}
