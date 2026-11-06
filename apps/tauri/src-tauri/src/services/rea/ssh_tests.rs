//! Exercise the real SSH stdio adapter, including fragmentation and stderr isolation.
use std::sync::Arc;

use russh::{client, server, ChannelId};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
struct ProtocolServer {
    buffer: Vec<u8>,
}

impl server::Handler for ProtocolServer {
    type Error = russh::Error;

    async fn auth_password(&mut self, _: &str, _: &str) -> Result<server::Auth, Self::Error> {
        Ok(server::Auth::Accept)
    }

    async fn channel_open_session(
        &mut self,
        _: russh::Channel<server::Msg>,
        reply: server::ChannelOpenHandle,
        _: &mut server::Session,
    ) -> Result<(), Self::Error> {
        reply.accept().await;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        command: &[u8],
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        assert_eq!(command, b"rea-test-mcp");
        session.channel_success(channel)?;
        session.extended_data(
            channel,
            1,
            b"test diagnostic; must not enter JSON stream\n".to_vec(),
        )?;
        Ok(())
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.buffer.extend_from_slice(data);
        while let Some(newline) = self.buffer.iter().position(|b| *b == b'\n') {
            let request: Value =
                serde_json::from_slice(&self.buffer.drain(..=newline).collect::<Vec<_>>()).unwrap();
            if request.get("id").is_none() {
                continue;
            }
            let result = match request["method"].as_str().unwrap() {
                "initialize" => {
                    json!({"protocolVersion":"2025-03-26","serverInfo":{"name":"ssh-fixture","version":"6.7.0"}})
                }
                "tools/list" => {
                    json!({"tools":[{"name":"inspect","inputSchema":{"type":"object"}}]})
                }
                "tools/call" => {
                    json!({"content":[{"type":"text","text":request["params"]["arguments"]["path"]}]})
                }
                _ => panic!("unexpected method"),
            };
            let bytes = format!(
                "{}\n",
                json!({"jsonrpc":"2.0","id":request["id"],"result":result})
            )
            .into_bytes();
            let mid = bytes.len() / 2;
            session.data(channel, bytes[..mid].to_vec())?;
            session.data(channel, bytes[mid..].to_vec())?;
        }
        Ok(())
    }
}

struct AcceptFixtureKey;
impl client::Handler for AcceptFixtureKey {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

#[tokio::test]
async fn ssh_transport_keeps_stdout_stderr_and_arguments_separate() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let mut config = server::Config::default();
    config.keys.push(
        russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::ssh_key::Algorithm::Ed25519)
            .unwrap(),
    );
    let task = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let running = server::run_stream(Arc::new(config), socket, ProtocolServer::default())
            .await
            .unwrap();
        let _ = running.await;
    });
    let mut handle = client::connect(
        Arc::new(client::Config::default()),
        address,
        AcceptFixtureKey,
    )
    .await
    .unwrap();
    assert!(handle
        .authenticate_password("test", "fixture")
        .await
        .unwrap()
        .success());
    let channel = handle.channel_open_session().await.unwrap();
    channel.exec(true, "rea-test-mcp").await.unwrap();
    let mut client = super::transport::ssh_client(channel);
    let token = CancellationToken::new();
    client.initialize(&token).await.unwrap();
    assert_eq!(client.tools.len(), 1);
    let path = "/remote/a'b;$(not-a-command)/\u{8d44}\u{6599}.js";
    let result = client
        .request(
            "tools/call",
            json!({"name":"inspect","arguments":{"path":path}}),
            &token,
        )
        .await
        .unwrap();
    assert_eq!(result["content"][0]["text"], path);
    assert!(client.diagnostics().contains("test diagnostic"));
    client.close().await;
    handle
        .disconnect(russh::Disconnect::ByApplication, "done", "")
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), task)
        .await
        .unwrap()
        .unwrap();
}
