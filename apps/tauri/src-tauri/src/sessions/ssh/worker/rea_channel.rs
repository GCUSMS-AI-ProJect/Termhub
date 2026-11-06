/// Open a dedicated binary-clean REA stdio channel without blocking terminal IO.
fn spawn_rea_channel(
    handle: &Arc<Handle<ClientHandler>>,
    exec_enabled: bool,
    command: String,
    respond_to: oneshot::Sender<Result<russh::Channel<russh::client::Msg>, String>>,
) {
    if !exec_enabled {
        let _ = respond_to.send(Err(
            "REA_UNSUPPORTED: SSH exec is disabled for this target".into()
        ));
        return;
    }
    let handle = handle.clone();
    tokio::spawn(async move {
        let operation = async {
            let channel = handle
                .channel_open_session()
                .await
                .map_err(|e| e.to_string())?;
            channel
                .exec(true, command)
                .await
                .map_err(|e| e.to_string())?;
            Ok(channel)
        };
        let result = timeout(Duration::from_secs(15), operation)
            .await
            .map_err(|_| "REA_TIMEOUT: SSH exec channel open timed out".to_string())
            .and_then(|v| v);
        // If the UI cancelled while opening, explicitly close a late channel.
        if let Err(Ok(channel)) = respond_to.send(result) {
            let _ = timeout(Duration::from_secs(2), channel.close()).await;
        }
    });
}
