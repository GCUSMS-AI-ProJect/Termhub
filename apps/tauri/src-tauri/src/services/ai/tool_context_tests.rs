#[cfg(test)]
mod tool_context_tests {
    use super::*;

    fn turn(id: &str, size: usize) -> ToolLoopTurn {
        ToolLoopTurn {
            follow_up: None,
            assistant_text: format!("Inspecting {id}"),
            continuation: ProviderContinuation {
                reasoning_content: Some("reasoning".repeat(size)),
                google_thought_signature: Some(format!("signature-{id}")),
                anthropic_blocks: BTreeMap::new(),
            },
            calls: vec![ProviderToolCall {
                id: id.into(),
                item_id: Some(format!("fc_{id}")),
                name: COPILOT_EXECUTE_REMOTE_COMMAND_TOOL.into(),
                arguments: json!({"command":format!("echo {id}"),"risk":"read-only"}).to_string(),
                google_thought_signature: Some(format!("call-signature-{id}")),
            }],
            results: vec![ToolLoopResult {
                call_id: id.into(),
                content: json!({"status":"executed","output":format!("result-{id}")}).to_string(),
            }],
        }
    }

    #[test]
    fn rolling_context_fits_old_reasoning_and_preserves_original_and_latest_signatures() {
        let original: Vec<_> = (0..10).map(|i| turn(&format!("t{i}"), 2_000)).collect();
        let before = format!("{original:?}");
        let steps = vec![AiTaskStep {
            title: "Verify the deployment".into(),
            status: "in-progress".into(),
        }];
        let projected = project_tool_loop_context(&original, 4_000, &steps);
        assert!(projected.len() < original.len());
        assert!(4_000 + tool_loop_context_tokens(&projected) <= CONTEXT_BUDGET_TOKENS);
        let memory = projected[0].follow_up.as_deref().unwrap();
        assert!(memory.contains("untrusted-tool-memory"));
        assert!(memory.contains("Verify the deployment"));
        assert!(memory.contains("Do not automatically repeat side effects"));
        assert!(memory.contains("observed result excerpt"));
        assert_eq!(
            format!("{:?}", projected.last().unwrap()),
            format!("{:?}", original.last().unwrap())
        );
        assert_eq!(format!("{original:?}"), before);
        // Reprojection starts from originals, never recursively summarizes a summary.
        assert_eq!(
            format!("{projected:?}"),
            format!("{:?}", project_tool_loop_context(&original, 4_000, &steps))
        );
    }

    #[test]
    fn normalizing_missing_duplicate_and_orphan_results_never_claims_success() {
        let mut source = turn("call", 0);
        source.results = vec![ToolLoopResult {
            call_id: "orphan".into(),
            content: "executed".into(),
        }];
        let projected = project_tool_loop_context(std::slice::from_ref(&source), 0, &[]);
        assert_eq!(source.results[0].call_id, "orphan");
        assert_eq!(projected[0].results.len(), 1);
        assert_eq!(projected[0].results[0].call_id, "call");
        let result: Value = serde_json::from_str(&projected[0].results[0].content).unwrap();
        assert_eq!(result["status"], "unknown");
        assert!(result["reason"].as_str().unwrap().contains("not confirmed"));
        let mut complete = turn("call", 0);
        complete.results.push(complete.results[0].clone());
        normalize_tool_results(&mut complete);
        assert_eq!(complete.results.len(), 1);
    }

    #[test]
    fn all_three_protocols_preserve_pairing_after_compaction() {
        let original: Vec<_> = (0..8).map(|i| turn(&format!("t{i}"), 2_000)).collect();
        let projected = project_tool_loop_context(&original, 4_000, &[]);
        let conversation = tests::conversation(vec![]);
        let chat = provider_history_messages_with_tools(
            &conversation,
            None,
            AiChatResponseMode::Chat,
            &projected,
            true,
        );
        let responses = responses_input_items_with_tools(&conversation, &projected);
        let anthropic = anthropic_history_messages_with_tools(&conversation, &projected);
        for turn in projected.iter().skip(1) {
            let id = &turn.calls[0].id;
            assert_eq!(
                chat.iter()
                    .filter(|m| m["role"] == "tool" && m["tool_call_id"] == *id)
                    .count(),
                1
            );
            assert_eq!(
                responses
                    .iter()
                    .filter(|m| m["type"] == "function_call" && m["call_id"] == *id)
                    .count(),
                1
            );
            assert_eq!(
                responses
                    .iter()
                    .filter(|m| m["type"] == "function_call_output" && m["call_id"] == *id)
                    .count(),
                1
            );
            let blocks: Vec<_> = anthropic
                .iter()
                .filter_map(|m| m["content"].as_array())
                .flatten()
                .collect();
            assert_eq!(
                blocks
                    .iter()
                    .filter(|b| b["type"] == "tool_use" && b["id"] == *id)
                    .count(),
                1
            );
            assert_eq!(
                blocks
                    .iter()
                    .filter(|b| b["type"] == "tool_result" && b["tool_use_id"] == *id)
                    .count(),
                1
            );
        }
    }

    #[test]
    fn latest_claude_signed_blocks_are_kept_verbatim() {
        let mut original = vec![turn("old", 5_000), turn("new", 0)];
        original[1].continuation.anthropic_blocks.insert(
            0,
            json!({"type":"thinking","thinking":"opaque","signature":"signed-block"}),
        );
        original[1].continuation.anthropic_blocks.insert(1, json!({"type":"tool_use","id":"new","name":COPILOT_EXECUTE_REMOTE_COMMAND_TOOL,"input":{"command":"echo new","risk":"read-only"}}));
        let projected = project_tool_loop_context(&original, 4_000, &[]);
        assert_eq!(
            projected.last().unwrap().continuation.anthropic_blocks,
            original[1].continuation.anthropic_blocks
        );
        let messages =
            anthropic_history_messages_with_tools(&tests::conversation(vec![]), &projected);
        let blocks = messages.iter().find(|m| m["role"] == "assistant").unwrap()["content"]
            .as_array()
            .unwrap();
        assert_eq!(blocks[0]["signature"], "signed-block");
    }

    #[test]
    fn small_conversation_is_unchanged_and_oversized_latest_is_not_corrupted() {
        let small = vec![turn("small", 0)];
        assert_eq!(
            format!("{:?}", project_tool_loop_context(&small, 0, &[])),
            format!("{small:?}")
        );
        let large = vec![turn("large", 20_000)];
        let projected = project_tool_loop_context(&large, 15_000, &[]);
        // Budget remains an estimate: opaque state and current input are never
        // cut merely to claim the soft target was met.
        assert_eq!(format!("{projected:?}"), format!("{large:?}"));
    }

    #[test]
    fn excerpts_are_utf8_safe_bounded_and_memory_is_not_a_new_tool_result() {
        let text = "中文🙂".repeat(5_000);
        assert!(tool_memory_excerpt(&text, 240).chars().count() <= 243);
        let mut turns: Vec<_> = (0..20).map(|i| turn(&format!("t{i}"), 2_000)).collect();
        for turn in &mut turns {
            turn.results[0].content = text.clone();
        }
        let projected = project_tool_loop_context(&turns, 4_000, &[]);
        assert!(projected[0].calls.is_empty());
        assert!(projected[0].results.is_empty());
        assert!(projected[0].follow_up.as_ref().unwrap().chars().count() < 5_000);
    }
}
