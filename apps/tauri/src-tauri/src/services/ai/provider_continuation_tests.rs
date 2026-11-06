#[cfg(test)]
mod provider_continuation_tests {
    use super::tests::{conversation, provider, read_request, stream_channel};
    use super::*;
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpListener;

    fn tool_turn(mut stream: ChatStreamResult) -> ToolLoopTurn {
        stream.finalize_tool_calls();
        ToolLoopTurn {
            follow_up: None,
            assistant_text: stream.content,
            continuation: stream.continuation,
            results: stream
                .tool_calls
                .iter()
                .map(|call| ToolLoopResult {
                    call_id: call.id.clone(),
                    content: "fixture result".into(),
                })
                .collect(),
            calls: stream
                .tool_calls
                .iter()
                .map(provider_safe_tool_call)
                .collect(),
        }
    }

    #[test]
    fn gemini_signatures_stay_on_their_original_parallel_calls() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let channel = stream_channel(events.clone());
        let mut stream = ChatStreamResult::default();
        process_openai_payload(json!({"choices":[{"delta":{"tool_calls":[
            {"index":0,"id":"first","function":{"name":COPILOT_EXECUTE_REMOTE_COMMAND_TOOL,"arguments":"{\"command\":\"pwd\"}"}},
            {"index":1,"id":"second","function":{"name":COPILOT_EXECUTE_REMOTE_COMMAND_TOOL,"arguments":"{\"command\":\"id\"}"}}
        ]}}]}), &mut stream, &channel).unwrap();
        // Signatures can arrive after the function arguments, on a delta with
        // no function/name/id fields. Other provider fields are not forwarded.
        process_openai_payload(json!({"choices":[{"delta":{"tool_calls":[
            {"index":0,"extra_content":{"google":{"thought_signature":"opaque+/signature=="},"unexpected":"discard"}}
        ]},"finish_reason":"tool_calls"}]}), &mut stream, &channel).unwrap();
        let turns = [tool_turn(stream)];
        let messages = provider_history_messages_with_tools(
            &conversation(vec![]),
            None,
            AiChatResponseMode::Chat,
            &turns,
            true,
        );
        assert_eq!(
            messages[1]["tool_calls"][0]["extra_content"],
            json!({"google":{"thought_signature":"opaque+/signature=="}})
        );
        assert!(messages[1]["tool_calls"][1].get("extra_content").is_none());
        assert!(events.lock().unwrap().is_empty());
    }

    #[test]
    fn buffered_openai_calls_preserve_signatures_and_reasoning() {
        let channel = stream_channel(Arc::new(Mutex::new(Vec::new())));
        let mut stream = ChatStreamResult::default();
        process_openai_payload(json!({"choices":[{"message":{
            "content":"Checking.","reasoning_content":"provider continuation",
            "extra_content":{"google":{"thought_signature":"message-signature"}},
            "tool_calls":[{"id":"call","type":"function", "extra_content":{"google":{"thought_signature":"call-signature"}},
                "function":{"name":COPILOT_EXECUTE_REMOTE_COMMAND_TOOL,"arguments":"{\"command\":\"pwd\"}"}}]
        },"finish_reason":"tool_calls"}]}), &mut stream, &channel).unwrap();
        let turns = [tool_turn(stream)];
        let messages = provider_history_messages_with_tools(
            &conversation(vec![]),
            None,
            AiChatResponseMode::Chat,
            &turns,
            true,
        );
        assert_eq!(messages[1]["reasoning_content"], "provider continuation");
        assert_eq!(
            messages[1]["extra_content"]["google"]["thought_signature"],
            "message-signature"
        );
        assert_eq!(
            messages[1]["tool_calls"][0]["extra_content"]["google"]["thought_signature"],
            "call-signature"
        );
        assert!(!json!(responses_input_items_with_tools(
            &conversation(vec![]),
            &turns
        ))
        .to_string()
        .contains("signature"));
    }

    #[test]
    fn deepseek_stream_reasoning_is_replayed_without_becoming_chat_text() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let channel = stream_channel(events.clone());
        let mut stream = ChatStreamResult::default();
        for reasoning in ["inspect ", "the service"] {
            process_openai_payload(
                json!({"choices":[{"delta":{"reasoning_content":reasoning}}]}),
                &mut stream,
                &channel,
            )
            .unwrap();
        }
        process_openai_payload(
            json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call","function":{
            "name":COPILOT_EXECUTE_REMOTE_COMMAND_TOOL,"arguments":"{\"command\":\"pwd\"}"
        }}]},"finish_reason":"tool_calls"}]}),
            &mut stream,
            &channel,
        )
        .unwrap();
        assert!(stream.content.is_empty());
        assert!(events.lock().unwrap().is_empty());
        let turns = [tool_turn(stream)];
        let messages = provider_history_messages_with_tools(
            &conversation(vec![]),
            None,
            AiChatResponseMode::Chat,
            &turns,
            true,
        );
        assert_eq!(messages[1]["reasoning_content"], "inspect the service");
    }

    #[test]
    fn claude_stream_thinking_and_redacted_blocks_keep_order_and_signatures() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let channel = stream_channel(events.clone());
        let mut stream = ChatStreamResult::default();
        for payload in [
            json!({"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}),
            json!({"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"inspect"}}),
            json!({"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-"}}),
            json!({"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"exact"}}),
            json!({"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}),
            json!({"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Checking."}}),
            json!({"type":"content_block_start","index":2,"content_block":{"type":"redacted_thinking","data":"opaque-redacted"}}),
            json!({"type":"content_block_start","index":3,"content_block":{"type":"tool_use","id":"call","name":COPILOT_EXECUTE_REMOTE_COMMAND_TOOL,"input":{}}}),
            json!({"type":"content_block_delta","index":3,"delta":{"type":"input_json_delta","partial_json":"{\"command\":\"pwd\",\"sudo_password\":\"discard\"}"}}),
        ] {
            process_anthropic_payload(payload, &mut stream, &channel).unwrap();
        }
        let turns = [tool_turn(stream)];
        let messages = anthropic_history_messages_with_tools(&conversation(vec![]), &turns);
        assert_eq!(
            messages[0]["content"][0],
            json!({"type":"thinking","thinking":"inspect","signature":"sig-exact"})
        );
        assert_eq!(
            messages[0]["content"][1],
            json!({"type":"text","text":"Checking."})
        );
        assert_eq!(
            messages[0]["content"][2],
            json!({"type":"redacted_thinking","data":"opaque-redacted"})
        );
        assert_eq!(messages[0]["content"][3]["input"], json!({"command":"pwd"}));
        assert_eq!(
            *events.lock().unwrap(),
            vec![json!({"type":"text-delta","text":"Checking."})]
        );
    }

    #[test]
    fn provider_continuation_rejects_oversized_metadata_without_truncating_signatures() {
        let channel = stream_channel(Arc::new(Mutex::new(Vec::new())));
        let mut stream = ChatStreamResult::default();
        let signature = "x".repeat(MAX_PROVIDER_CONTINUATION_BYTES + 1);
        assert!(process_openai_payload(
            json!({"choices":[{"delta":{
                "extra_content":{"google":{"thought_signature":signature}}
            }}]}),
            &mut stream,
            &channel
        )
        .is_err());
        assert!(stream.continuation.google_thought_signature.is_none());
    }

    #[test]
    fn google_compatible_urls_and_reasoning_use_the_official_protocol() {
        let mut provider = provider("https://generativelanguage.googleapis.com/v1beta/openai/");
        provider.model = "gemini-3.8-flash".into();
        assert_eq!(
            chat_completions_url(&provider).unwrap().as_str(),
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        );
        assert_eq!(
            models_url(&provider).unwrap().as_str(),
            "https://generativelanguage.googleapis.com/v1beta/openai/models"
        );
        let mut payload = json!({});
        apply_openai_compatible_reasoning(&mut payload, &provider, Some(AiReasoningEffort::Medium));
        assert_eq!(payload, json!({"reasoning_effort":"medium"}));
    }

    #[test]
    fn qwen_hybrid_reasoning_uses_enable_thinking_only_on_official_endpoints() {
        for base in [
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        ] {
            let mut provider = provider(base);
            provider.model = "qwen3.8-max".into();
            for (effort, expected) in [
                (AiReasoningEffort::None, false),
                (AiReasoningEffort::Low, true),
            ] {
                let mut payload = json!({});
                apply_openai_compatible_reasoning(&mut payload, &provider, Some(effort));
                assert_eq!(payload, json!({"enable_thinking":expected}));
            }
        }
        let mut generic = provider("https://gateway.test/v1");
        generic.model = "qwen3.8-max".into();
        let mut payload = json!({});
        apply_openai_compatible_reasoning(&mut payload, &generic, Some(AiReasoningEffort::Low));
        assert!(payload.get("enable_thinking").is_none());
    }

    #[tokio::test]
    async fn gemini_two_request_tool_exchange_replays_opaque_signature() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            for step in 0..2 {
                let (mut socket, _) = listener.accept().await.unwrap();
                let request = read_request(&mut socket).await;
                assert!(request.starts_with("POST /v1beta/openai/chat/completions HTTP/1.1"));
                assert!(request
                    .lines()
                    .any(|line| line.eq_ignore_ascii_case("authorization: Bearer fixture-key")));
                let body: Value =
                    serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
                let event = if step == 0 {
                    assert!(body["tools"].is_array());
                    json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1", "extra_content":{"google":{"thought_signature":"fixture-signature+/="}},
                        "function":{"name":COPILOT_EXECUTE_REMOTE_COMMAND_TOOL,"arguments":"{\"command\":\"pwd\",\"risk\":\"read-only\"}"}}]},"finish_reason":"tool_calls"}]})
                } else {
                    let assistant = body["messages"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|item| item.get("tool_calls").is_some())
                        .unwrap();
                    assert_eq!(
                        assistant["tool_calls"][0]["extra_content"]["google"]["thought_signature"],
                        "fixture-signature+/="
                    );
                    assert_eq!(
                        body["messages"].as_array().unwrap().last().unwrap()["tool_call_id"],
                        "call-1"
                    );
                    json!({"choices":[{"delta":{"content":"Complete."},"finish_reason":"stop"}]})
                };
                let sse = format!("data: {event}\n\ndata: [DONE]\n\n");
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{sse}", sse.len());
                socket.write_all(response.as_bytes()).await.unwrap();
            }
        });
        let mut provider = provider(&format!("http://{address}/v1beta/openai"));
        provider.allow_insecure_http = true;
        provider.model = "gemini-3.8-flash".into();
        let conversation = conversation(vec![]);
        let channel = stream_channel(Arc::new(Mutex::new(Vec::new())));
        let cancellation = CancellationToken::new();
        let first = stream_openai_compatible_chat_with_tools(
            &provider,
            Some("fixture-key"),
            &conversation,
            None,
            AiChatResponseMode::Chat,
            None,
            &[],
            true,
            &channel,
            &cancellation,
        )
        .await
        .unwrap();
        let turns = [tool_turn(first)];
        let final_response = stream_openai_compatible_chat_with_tools(
            &provider,
            Some("fixture-key"),
            &conversation,
            None,
            AiChatResponseMode::Chat,
            None,
            &turns,
            true,
            &channel,
            &cancellation,
        )
        .await
        .unwrap();
        assert_eq!(final_response.content, "Complete.");
        server.await.unwrap();
    }

    fn history_message(id: &str, role: AiMessageRole, content: &str) -> AiMessage {
        AiMessage {
            id: id.into(),
            role,
            content: content.into(),
            created_at: "1".into(),
            context: None,
            attachments: vec![],
            tool_activities: vec![],
        }
    }

    #[test]
    fn chat_reasoning_survives_a_user_followup_and_stays_private_and_source_bound() {
        let mut provider = provider("https://api.deepseek.com/v1");
        provider.model = "deepseek-v4-pro".into();
        let mut conversation = conversation(vec![
            history_message("u1", AiMessageRole::User, "Inspect"),
            history_message("a1", AiMessageRole::Assistant, "Checking"),
            history_message("a2", AiMessageRole::Assistant, "Healthy"),
            history_message("u2", AiMessageRole::User, "Check again"),
        ]);
        for (id, content) in [
            ("a1", "first tool reasoning"),
            ("a2", "final reply reasoning"),
        ] {
            remember_provider_reasoning(
                &mut conversation,
                &provider,
                &AssistantMessageDraft {
                    id: id.into(),
                    content: String::new(),
                    tool_activities: vec![],
                    reasoning_content: Some(content.into()),
                },
            );
        }
        let bytes = serde_json::to_vec(&conversation).unwrap();
        let saved: StoredConversationFile = serde_json::from_slice(&bytes).unwrap();
        conversation.provider_reasoning = saved.provider_reasoning;
        let mut payload = json!({"messages":provider_history_messages(&conversation, None, AiChatResponseMode::Chat)});
        apply_stored_provider_reasoning(&mut payload, &conversation, &provider);
        assert_eq!(
            payload["messages"][2]["reasoning_content"],
            "first tool reasoning\n\nfinal reply reasoning"
        );
        assert_eq!(payload["messages"][3]["content"], "Check again");
        let public = serde_json::to_string(&public_conversation(conversation.clone())).unwrap();
        assert!(!public.contains("reasoning"));
        assert!(!json!(title_summary_chat_messages(&conversation))
            .to_string()
            .contains("reasoning"));
        for change in ["model", "provider", "endpoint", "protocol"] {
            let mut other = provider.clone();
            match change {
                "model" => other.model = "different-model".into(),
                "provider" => other.id = "different-provider".into(),
                "endpoint" => other.base_url = "https://different.test/v1".into(),
                _ => other.kind = AiProviderKind::OpenaiResponses,
            }
            let mut payload = json!({"messages":provider_history_messages(&conversation, None, AiChatResponseMode::Chat)});
            apply_stored_provider_reasoning(&mut payload, &conversation, &other);
            assert!(
                payload["messages"][2].get("reasoning_content").is_none(),
                "{change} must not receive other provider state"
            );
        }
    }

    #[test]
    fn private_reasoning_defaults_for_old_files_and_is_removed_with_messages() {
        let mut conversation = conversation(vec![history_message(
            "a1",
            AiMessageRole::Assistant,
            "Reply",
        )]);
        let old = serde_json::to_value(&conversation).unwrap();
        assert!(old.get("providerReasoning").is_none());
        let old: StoredConversationFile = serde_json::from_value(old).unwrap();
        assert!(old.provider_reasoning.is_empty());
        remember_provider_reasoning(
            &mut conversation,
            &provider("https://provider.test/v1"),
            &AssistantMessageDraft {
                id: "a1".into(),
                content: "Reply".into(),
                tool_activities: vec![],
                reasoning_content: Some("private state".into()),
            },
        );
        assert_eq!(conversation.provider_reasoning.len(), 1);
        conversation.messages.clear();
        prune_provider_reasoning(&mut conversation);
        assert!(conversation.provider_reasoning.is_empty());
        assert!(!serde_json::to_string(&conversation)
            .unwrap()
            .contains("private state"));
    }

    #[test]
    fn saved_deepseek_auto_capabilities_keep_the_official_disable_mapping() {
        let mut provider = provider("https://api.deepseek.com/v1");
        provider.model = "deepseek-v4-pro".into();
        provider.model_capabilities.insert(
            provider.model.clone(),
            AiModelCapabilities {
                reasoning: AiModelReasoningConfig {
                    mode: AiModelReasoningMode::Effort,
                    parameter: AiModelReasoningParameter::Auto,
                    efforts: vec![
                        AiReasoningEffort::None,
                        AiReasoningEffort::Low,
                        AiReasoningEffort::High,
                    ],
                    budgets: BTreeMap::new(),
                },
                ..Default::default()
            },
        );
        let mut payload = json!({});
        apply_openai_compatible_reasoning(&mut payload, &provider, Some(AiReasoningEffort::None));
        assert_eq!(payload, json!({"thinking":{"type":"disabled"}}));
        let mut payload = json!({});
        apply_openai_compatible_reasoning(&mut payload, &provider, Some(AiReasoningEffort::Low));
        assert_eq!(
            payload,
            json!({"thinking":{"type":"enabled"},"reasoning_effort":"low"})
        );
    }
}
