use super::client::ReaClient;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn handshake_pagination_and_server_callbacks_use_one_session() {
    let (local, remote) = tokio::io::duplex(16384);
    let (read, write) = tokio::io::split(local);
    let mut client = ReaClient::new(read, write, None);
    let server = tokio::spawn(async move {
        let (read, mut write) = tokio::io::split(remote);
        let mut lines = BufReader::new(read).lines();
        let initialize: Value =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(initialize["method"], "initialize");
        assert_eq!(initialize["params"]["capabilities"], json!({}));
        write.write_all(format!("{}\n", json!({"jsonrpc":"2.0","id":initialize["id"],"result":{"protocolVersion":"2025-03-26","serverInfo":{"name":"test-rea","version":"6.7.0"}}})).as_bytes()).await.unwrap();
        let initialized: Value =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(initialized["method"], "notifications/initialized");
        for page in 0..2 {
            let request: Value =
                serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
            assert_eq!(request["method"], "tools/list");
            if page == 1 {
                assert_eq!(request["params"]["cursor"], "second");
            }
            let mut result =
                json!({"tools":[{"name":format!("tool_{page}"),"inputSchema":{"type":"object"}}]});
            if page == 0 {
                result["nextCursor"] = json!("second");
            }
            write
                .write_all(
                    format!(
                        "{}\n",
                        json!({"jsonrpc":"2.0","id":request["id"],"result":result})
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        }
        let call: Value = serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(call["params"]["arguments"]["path"], "a';$file\n.json");
        write.write_all(b"{\"jsonrpc\":\"2.0\",\"id\":\"callback\",\"method\":\"sampling/createMessage\",\"params\":{}}\n").await.unwrap();
        let denied: Value =
            serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(denied["id"], "callback");
        assert_eq!(denied["error"]["code"], -32601);
        write.write_all(format!("{}\n", json!({"jsonrpc":"2.0","id":call["id"],"result":{"content":[{"type":"text","text":"analysis evidence"}]}})).as_bytes()).await.unwrap();
    });
    let token = CancellationToken::new();
    client.initialize(&token).await.unwrap();
    assert_eq!(client.tools.len(), 2);
    let result = client
        .request(
            "tools/call",
            json!({"name":"tool_1","arguments":{"path":"a';$file\n.json"}}),
            &token,
        )
        .await
        .unwrap();
    assert_eq!(result["content"][0]["text"], "analysis evidence");
    client.close().await;
    server.await.unwrap();
}

#[tokio::test]
async fn cancellation_interrupts_an_unresponsive_server() {
    let (local, _remote) = tokio::io::duplex(4096);
    let (read, write) = tokio::io::split(local);
    let mut client = ReaClient::new(read, write, None);
    let token = CancellationToken::new();
    let cancel = token.clone();
    tokio::spawn(async move {
        tokio::task::yield_now().await;
        cancel.cancel();
    });
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        client.request("tools/list", json!({}), &token),
    )
    .await
    .unwrap();
    assert!(result.unwrap_err().contains("REA_CANCELLED"));
}

#[tokio::test]
async fn mismatched_response_ids_and_rpc_errors_are_not_successes() {
    for response in [
        json!({"jsonrpc":"2.0","id":99,"result":{}}),
        json!({"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"bad input"}}),
        json!({"jsonrpc":"1.0","id":1,"result":{}}),
    ] {
        let (local, remote) = tokio::io::duplex(4096);
        let (read, write) = tokio::io::split(local);
        let mut client = ReaClient::new(read, write, None);
        let task = tokio::spawn(async move {
            let (read, mut write) = tokio::io::split(remote);
            let _ = BufReader::new(read).lines().next_line().await;
            write
                .write_all(format!("{response}\n").as_bytes())
                .await
                .unwrap();
        });
        assert!(client
            .request("tools/call", json!({}), &CancellationToken::new())
            .await
            .is_err());
        task.await.unwrap();
    }
}

#[tokio::test]
async fn repeated_catalog_cursors_fail_instead_of_looping() {
    let (local, remote) = tokio::io::duplex(4096);
    let (read, write) = tokio::io::split(local);
    let mut client = ReaClient::new(read, write, None);
    let task = tokio::spawn(async move {
        let (read, mut write) = tokio::io::split(remote);
        let mut lines = BufReader::new(read).lines();
        while let Some(line) = lines.next_line().await.unwrap() {
            let request: Value = serde_json::from_str(&line).unwrap();
            if request.get("id").is_none() {
                continue;
            }
            let result = if request["method"] == "initialize" {
                json!({"protocolVersion":"2025-03-26","serverInfo":{}})
            } else {
                json!({"tools":[],"nextCursor":"repeated"})
            };
            write
                .write_all(
                    format!(
                        "{}\n",
                        json!({"jsonrpc":"2.0","id":request["id"],"result":result})
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        }
    });
    assert!(client
        .initialize(&CancellationToken::new())
        .await
        .unwrap_err()
        .contains("repeated"));
    client.close().await;
    task.await.unwrap();
}

#[tokio::test]
#[ignore = "requires npm run prepare:rea and the bundled Node/REA runtime"]
async fn bundled_rea_performs_real_javascript_analysis() {
    let runtime = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/rea");
    let mut command =
        tokio::process::Command::new(runtime.join(if cfg!(windows) { "node.exe" } else { "node" }));
    command
        .arg(runtime.join("node_modules/rea-agents/scripts/rea.mjs"))
        .arg("mcp")
        .env("REA_MCP_OUTPUT_SCHEMA_PROFILE", "off")
        .env("REA_MCP_MAX_RESPONSE_BYTES", "16777216")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn().unwrap();
    let mut client = ReaClient::new(
        child.stdout.take().unwrap(),
        child.stdin.take().unwrap(),
        Some(child),
    );
    let token = CancellationToken::new();
    client.initialize(&token).await.unwrap();
    assert!(client
        .tools
        .iter()
        .any(|t| t["name"] == "analyze_javascript_application"));
    println!("REA server {}: {} tools", client.server, client.tools.len());
    let directory =
        std::env::temp_dir().join(format!("transterm-rea-fixture-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&directory).unwrap();
    std::fs::write(
        directory.join("package.json"),
        r#"{"name":"rea-fixture","version":"1.0.0","type":"module","main":"index.js"}"#,
    )
    .unwrap();
    std::fs::write(
        directory.join("index.js"),
        "import { add } from './math.js'; export const answer = add(20, 22);\n",
    )
    .unwrap();
    std::fs::write(
        directory.join("math.js"),
        "export const add = (a, b) => a + b;\n",
    )
    .unwrap();
    let result = client.request("tools/call", json!({"name":"analyze_javascript_application","arguments":{"input_path":directory.to_string_lossy(),"detail":"summary"}}), &token).await.unwrap();
    println!(
        "REA analysis returned structured Evidence ({} bytes)",
        result.to_string().len()
    );
    assert_ne!(result["isError"], true);
    assert!(result.to_string().contains("evidence_id"));
    client.close().await;
    std::fs::remove_file(directory.join("index.js")).unwrap();
    std::fs::remove_file(directory.join("math.js")).unwrap();
    std::fs::remove_file(directory.join("package.json")).unwrap();
    std::fs::remove_dir(directory).unwrap();
}
