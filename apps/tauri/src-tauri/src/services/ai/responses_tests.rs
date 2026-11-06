#[cfg(test)]
mod responses_tests {
    use super::*;
    use std::collections::BTreeSet;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn assert_strict_schema(schema: &Value) {
        if schema["type"] == "object" {
            assert_eq!(schema["additionalProperties"], false);
            let properties = schema["properties"].as_object().expect("object properties");
            let required = schema["required"].as_array().expect("required fields");
            assert_eq!(
                properties
                    .keys()
                    .map(String::as_str)
                    .collect::<BTreeSet<_>>(),
                required
                    .iter()
                    .map(|v| v.as_str().expect("field name"))
                    .collect()
            );
            for child in properties.values() {
                assert_strict_schema(child);
            }
        }
        if let Some(items) = schema.get("items") {
            assert_strict_schema(items);
        }
    }

    #[test]
    fn responses_all_offered_tools_satisfy_strict_schema_contract() {
        let context = AiPromptContext {
            mode: AiContextMode::Level2,
            preview: "Synthetic SSH target".into(),
            network_device: false,
            rea_enabled: true,
        };
        let tools = provider_tool_schemas(AiProviderKind::OpenaiResponses, Some(&context));
        assert_eq!(tools.len(), 4);
        for tool in tools {
            assert_eq!(tool["strict"], true);
            assert_strict_schema(&tool["parameters"]);
        }
    }

    #[test]
    fn responses_failure_exposes_schema_reason_without_credentials() {
        let mut stream = ChatStreamResult::default();
        let error = process_openai_responses_payload(
            json!({"type":"response.failed","response":{
                "status":"failed","error":{"code":"invalid_function_parameters",
                "message":"Invalid schema: required must include explanation. Authorization: Bearer fixture-secret\napi_key=fixture-key\nsk-fixture-raw-key"}}}),
            &mut stream, &Channel::new(|_| Ok(())),
        ).expect_err("HTTP 200 failure must be reported").to_string();
        assert!(error.contains("invalid_function_parameters"));
        assert!(error.contains("explanation"));
        assert!(error.contains("工具参数定义"));
        assert!(!error.contains("fixture-secret"));
        assert!(!error.contains("fixture-key"));
        assert!(!error.contains("sk-fixture"));
        assert!(error.contains("[REDACTED]"));
    }

    #[test]
    fn responses_error_formats_and_incomplete_causes_are_checked() {
        let cases = [
            (
                json!({"type":"error","code":"server_error","message":"Synthetic unavailable"}),
                "Synthetic unavailable",
            ),
            (
                json!({"type":"error","error":{"code":"server_error","message":"Nested unavailable"}}),
                "Nested unavailable",
            ),
            (
                json!({"status":"failed","error":{"code":"invalid_function_parameters","message":"Schema invalid"}}),
                "Schema invalid",
            ),
            (
                json!({"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}),
                "输出额度",
            ),
            (
                json!({"type":"response.incomplete","response":{"incomplete_details":{"reason":"content_filter"}}}),
                "内容过滤",
            ),
            (
                json!({"type":"response.failed","response":{"status":"completed"}}),
                "请求失败",
            ),
        ];
        for (payload, expected) in cases {
            let error = process_openai_responses_payload(
                payload,
                &mut ChatStreamResult::default(),
                &Channel::new(|_| Ok(())),
            )
            .expect_err("failed and incomplete responses must not succeed")
            .to_string();
            assert!(error.contains(expected), "{error}");
        }
    }

    #[test]
    fn responses_error_details_are_bounded_and_control_sequences_removed() {
        let error = responses_provider_error(
            &json!({"status":"failed","error":{
                "code":"unsafe\ncode", "message":format!("\u{1b}[31m{}", "界".repeat(2000))
            }}),
            "",
        )
        .expect("failed response")
        .to_string();
        assert!(!error.contains('\u{1b}'));
        assert!(!error.contains("unsafe"));
        assert!(error.chars().count() < 650);
    }

    #[tokio::test]
    async fn responses_http_200_failure_cannot_return_partial_tool_calls() {
        for content_type in ["text/event-stream", "application/json"] {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = [0; 4096];
                assert!(socket.read(&mut request).await.unwrap() > 0);
                let failed = json!({"status":"failed","error":{"code":"invalid_function_parameters","message":"required must include explanation"}});
                let body = if content_type == "application/json" {
                    failed.to_string()
                } else {
                    format!(
                        "data: {}\n\ndata: {}\n\n",
                        json!({"type":"response.output_item.done","item":{"type":"function_call","id":"fc_fixture","call_id":"call_fixture","name":COPILOT_EXECUTE_REMOTE_COMMAND_TOOL,"arguments":"{\"command\":\"pwd\"}"}}),
                        json!({"type":"response.failed","response":failed})
                    )
                };
                socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
            });
            let response = reqwest::get(format!("http://{address}/responses"))
                .await
                .unwrap();
            let result = consume_streaming_response(
                response,
                &CancellationToken::new(),
                &Channel::new(|_| Ok(())),
                process_openai_responses_payload,
            )
            .await;
            assert!(matches!(result, Err(error) if error.to_string().contains("explanation")));
            server.await.unwrap();
        }
    }
}
