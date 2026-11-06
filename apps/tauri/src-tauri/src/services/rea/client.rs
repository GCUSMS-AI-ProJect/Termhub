//! A bounded, sequential MCP stdio client. One owner, one outstanding request.
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::process::Child;
use tokio_util::sync::CancellationToken;

pub const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(180);
const MAX_MESSAGE: u64 = 16 * 1024 * 1024;
type Reader = BufReader<Box<dyn AsyncRead + Unpin + Send>>;
type Writer = Box<dyn AsyncWrite + Unpin + Send>;

pub struct ReaClient {
    reader: Reader,
    writer: Writer,
    next_id: u64,
    pub tools: Vec<Value>,
    pub server: Value,
    // kill_on_drop is set before spawning. Holding it also reaps local children.
    _child: Option<Child>,
    lifetime: CancellationToken,
    diagnostics: std::sync::Arc<std::sync::Mutex<String>>,
}

impl ReaClient {
    pub fn new(
        reader: impl AsyncRead + Unpin + Send + 'static,
        writer: impl AsyncWrite + Unpin + Send + 'static,
        child: Option<Child>,
    ) -> Self {
        Self {
            reader: BufReader::new(Box::new(reader)),
            writer: Box::new(writer),
            next_id: 0,
            tools: Vec::new(),
            server: Value::Null,
            _child: child,
            lifetime: CancellationToken::new(),
            diagnostics: Default::default(),
        }
    }

    pub fn set_transport(
        &mut self,
        lifetime: CancellationToken,
        diagnostics: std::sync::Arc<std::sync::Mutex<String>>,
    ) {
        self.lifetime = lifetime;
        self.diagnostics = diagnostics;
    }

    pub fn diagnostics(&self) -> String {
        self.diagnostics
            .lock()
            .map(|v| v.clone())
            .unwrap_or_default()
    }

    async fn write(&mut self, value: Value) -> Result<(), String> {
        let mut data = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
        if data.len() > MAX_MESSAGE as usize {
            return Err("REA_MESSAGE_TOO_LARGE: request exceeds 16 MiB".into());
        }
        data.push(b'\n');
        self.writer
            .write_all(&data)
            .await
            .map_err(|e| e.to_string())?;
        self.writer.flush().await.map_err(|e| e.to_string())
    }

    pub async fn request(
        &mut self,
        method: &str,
        params: Value,
        cancellation: &CancellationToken,
    ) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let operation = async {
            self.write(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
                .await?;
            loop {
                let mut line = Vec::new();
                let n = (&mut self.reader)
                    .take(MAX_MESSAGE + 1)
                    .read_until(b'\n', &mut line)
                    .await
                    .map_err(|e| e.to_string())?;
                if n == 0 {
                    return Err("REA_DISCONNECTED: server closed the channel; check Node.js/npm and analysis engine availability".into());
                }
                if n as u64 > MAX_MESSAGE {
                    return Err("REA_MESSAGE_TOO_LARGE: response exceeds 16 MiB".into());
                }
                let message: Value = serde_json::from_slice(&line)
                    .map_err(|e| format!("REA_PROTOCOL: invalid JSON-RPC: {e}"))?;
                if message["jsonrpc"] != "2.0" {
                    return Err("REA_PROTOCOL: unsupported message envelope".into());
                }
                if let Some(server_method) = message["method"].as_str() {
                    if let Some(server_id) = message.get("id") {
                        if server_method == "ping" {
                            self.write(json!({"jsonrpc":"2.0","id":server_id,"result":{}}))
                                .await?;
                        } else {
                            // No sampling, elicitation, credential prompts or server-side execution callbacks.
                            self.write(json!({"jsonrpc":"2.0","id":server_id,"error":{"code":-32601,"message":"Client capability not supported"}})).await?;
                        }
                    }
                    continue;
                }
                if message["id"] != id {
                    return Err("REA_PROTOCOL: unexpected response ID".into());
                }
                if let Some(error) = message.get("error") {
                    return Err(format!("REA_RPC: {error}"));
                }
                return message
                    .get("result")
                    .cloned()
                    .ok_or_else(|| "REA_PROTOCOL: missing result".into());
            }
        };
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => Err("REA_CANCELLED".into()),
            result = tokio::time::timeout(TIMEOUT, operation) => result
                .map_err(|_| "REA_TIMEOUT: request exceeded 180 seconds".to_string())?,
        }
    }

    pub async fn initialize(&mut self, cancellation: &CancellationToken) -> Result<(), String> {
        let result = self
            .request(
                "initialize",
                json!({
                    "protocolVersion":"2025-03-26", "capabilities":{},
                    "clientInfo":{"name":"transterm","version":env!("CARGO_PKG_VERSION")}
                }),
                cancellation,
            )
            .await?;
        if !matches!(
            result["protocolVersion"].as_str(),
            Some("2024-11-05" | "2025-03-26" | "2025-06-18")
        ) {
            return Err("REA_PROTOCOL: incompatible protocol version".into());
        }
        self.server = result["serverInfo"].clone();
        self.write(json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
            .await?;
        let mut cursor: Option<String> = None;
        for _ in 0..32 {
            let page = self
                .request(
                    "tools/list",
                    cursor
                        .as_ref()
                        .map_or_else(|| json!({}), |c| json!({"cursor":c})),
                    cancellation,
                )
                .await?;
            let tools = page["tools"]
                .as_array()
                .ok_or("REA_PROTOCOL: invalid tools/list")?;
            self.tools.extend(tools.iter().cloned());
            if self.tools.len() > 4096 {
                return Err("REA_PROTOCOL: excessive tool catalog".into());
            }
            let next = page["nextCursor"].as_str().map(str::to_owned);
            if next.is_none() {
                return Ok(());
            }
            if next == cursor {
                return Err("REA_PROTOCOL: repeated catalog cursor".into());
            }
            cursor = next;
        }
        Err("REA_PROTOCOL: excessive catalog pages".into())
    }

    pub async fn close(&mut self) {
        let _ =
            tokio::time::timeout(std::time::Duration::from_secs(2), self.writer.shutdown()).await;
        if let Some(child) = self._child.as_mut() {
            if tokio::time::timeout(std::time::Duration::from_secs(2), child.wait())
                .await
                .is_err()
            {
                let _ = child.kill().await;
            }
        }
        self.lifetime.cancel();
    }
}

impl Drop for ReaClient {
    fn drop(&mut self) {
        self.lifetime.cancel();
    }
}
