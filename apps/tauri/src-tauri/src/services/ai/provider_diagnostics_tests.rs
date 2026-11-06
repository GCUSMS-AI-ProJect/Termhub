#[cfg(test)]
mod provider_diagnostics_tests {
    use super::*;
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpListener;

    async fn fixture(
        kind: AiProviderKind,
        responses: Vec<(&'static str, String)>,
    ) -> (StoredAiProvider, tokio::task::JoinHandle<Vec<Value>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut provider =
            tests::provider(&format!("http://{}/v1", listener.local_addr().unwrap()));
        provider.kind = kind;
        provider.allow_insecure_http = true;
        let server = tokio::spawn(async move {
            let mut requests = Vec::new();
            for (content_type, body) in responses {
                let (mut socket, _) = listener.accept().await.unwrap();
                let request = tests::read_request(&mut socket).await;
                requests
                    .push(serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap());
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                socket.write_all(response.as_bytes()).await.unwrap();
            }
            requests
        });
        (provider, server)
    }

    fn test_http_client() -> Client {
        Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
    }

    #[tokio::test]
    async fn diagnostics_rejects_success_objects_and_fake_streams() {
        for (check, body) in [
            (
                AiProviderProbeKind::Connection,
                json!({"object":"chat.completion"}),
            ),
            (
                AiProviderProbeKind::Streaming,
                json!({"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}),
            ),
        ] {
            let (provider, server) = fixture(
                AiProviderKind::OpenaiCompatibleChat,
                vec![("application/json", body.to_string())],
            )
            .await;
            let result = run_provider_diagnostics(&test_http_client(), &provider, None, &[check])
                .await
                .unwrap();
            assert!(!result.ok);
            assert_eq!(result.checks[0].status, "failed");
            server.await.unwrap();
        }
    }

    #[tokio::test]
    async fn diagnostics_accepts_completed_streams_for_all_protocols() {
        let fixtures = [
            (AiProviderKind::OpenaiCompatibleChat, "data: {\"choices\":[{\"delta\":{\"content\":\"OK\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n"),
            (AiProviderKind::OpenaiResponses, "data: {\"type\":\"response.output_text.delta\",\"delta\":\"OK\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"output\":[]}}\n\n"),
            (AiProviderKind::AnthropicMessages, "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"OK\"}}\n\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\ndata: {\"type\":\"message_stop\"}\n\n"),
        ];
        for (kind, body) in fixtures {
            let (provider, server) = fixture(kind, vec![("text/event-stream", body.into())]).await;
            let result = run_provider_diagnostics(
                &test_http_client(),
                &provider,
                None,
                &[AiProviderProbeKind::Streaming],
            )
            .await
            .unwrap();
            assert!(result.ok, "{}", result.checks[0].message);
            assert_eq!(server.await.unwrap()[0]["stream"], true);
        }
    }

    #[tokio::test]
    async fn diagnostics_rejects_truncated_stream() {
        let (provider, server) = fixture(
            AiProviderKind::OpenaiCompatibleChat,
            vec![(
                "text/event-stream",
                "data: {\"choices\":[{\"delta\":{\"content\":\"OK\"}}]}\n\n".into(),
            )],
        )
        .await;
        assert!(
            !run_provider_diagnostics(
                &test_http_client(),
                &provider,
                None,
                &[AiProviderProbeKind::Streaming]
            )
            .await
            .unwrap()
            .ok
        );
        server.await.unwrap();
    }

    #[tokio::test]
    async fn diagnostics_round_trips_tool_results_in_all_protocols() {
        let args = json!({"token":PROBE_TOKEN});
        let fixtures = [
            (
                AiProviderKind::OpenaiCompatibleChat,
                json!({"choices":[{"message":{"reasoning_content":"private","tool_calls":[{"id":"call1","type":"function","function":{"name":PROBE_TOOL,"arguments":args.to_string()},"extra_content":{"google":{"thought_signature":"signature"}}}]},"finish_reason":"tool_calls"}]}),
                json!({"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}),
            ),
            (
                AiProviderKind::OpenaiResponses,
                json!({"status":"completed","output":[{"type":"function_call","id":"fc1","call_id":"call1","name":PROBE_TOOL,"arguments":args.to_string()}]}),
                json!({"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}),
            ),
            (
                AiProviderKind::AnthropicMessages,
                json!({"type":"message","content":[{"type":"thinking","thinking":"private","signature":"signature"},{"type":"tool_use","id":"call1","name":PROBE_TOOL,"input":args}],"stop_reason":"tool_use"}),
                json!({"type":"message","content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn"}),
            ),
        ];
        for (kind, call, response) in fixtures {
            let (provider, server) = fixture(
                kind,
                vec![
                    ("application/json", call.to_string()),
                    ("application/json", response.to_string()),
                ],
            )
            .await;
            let result = run_provider_diagnostics(
                &test_http_client(),
                &provider,
                None,
                &[AiProviderProbeKind::Tools],
            )
            .await
            .unwrap();
            assert!(result.ok, "{}", result.checks[0].message);
            let requests = server.await.unwrap();
            assert_eq!(requests.len(), 2);
            let history = requests[1].to_string();
            assert!(history.contains(PROBE_TOKEN));
            assert!(history.contains("call1"));
            if provider.kind != AiProviderKind::OpenaiResponses {
                assert!(history.contains("signature"));
            }
        }
    }

    #[test]
    fn diagnostics_image_payloads_embed_only_fixture_bytes() {
        for kind in [
            AiProviderKind::OpenaiCompatibleChat,
            AiProviderKind::OpenaiResponses,
            AiProviderKind::AnthropicMessages,
        ] {
            let mut provider = tests::provider("https://fixture.invalid/v1");
            provider.kind = kind;
            let payload = probe_payload(&provider, AiProviderProbeKind::Image, PROBE_IMAGES[0].1);
            let serialized = payload.to_string();
            assert!(serialized.contains(PROBE_IMAGES[0].1));
            assert!(!serialized.contains("https://"));
            assert_eq!(payload["stream"], false);
        }
    }

    #[test]
    fn diagnostics_http_errors_are_actionable_and_do_not_echo_response_bodies() {
        for code in [401, 403, 404, 429, 500] {
            let error =
                provider_probe_http_error(reqwest::StatusCode::from_u16(code).unwrap()).to_string();
            assert!(error.contains(&format!("HTTP {code}")));
            assert!(error.len() > 30);
        }
    }
}
