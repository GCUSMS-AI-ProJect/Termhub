#[cfg(test)]
mod task_plan_tests {
    use super::*;

    fn plan(status: &str) -> Value {
        json!({"steps":[{"title":"Verify result","status":status}],"explanation":"Inspect output","blocked":false})
    }

    #[test]
    fn task_plan_rejects_unbounded_invalid_and_ambiguous_progress() {
        for invalid in [
            plan("unknown"),
            json!({"steps":[],"explanation":"","blocked":false}),
            json!({"steps":[{"title":"a","status":"in-progress"},{"title":"b","status":"in-progress"}],"explanation":"","blocked":false}),
            json!({"steps":[{"title":"check","status":"pending"}],"explanation":"","blocked":true}),
            json!({"steps":[{"title":"x".repeat(161),"status":"pending"}],"explanation":"","blocked":false}),
        ] {
            assert!(parse_task_plan(&invalid.to_string()).is_err(), "{invalid}");
        }
        let parsed = parse_task_plan(&json!({"steps":[{"title":"api_key=secret","status":"pending"}],"explanation":"Authorization: Bearer private-key","blocked":false}).to_string()).unwrap();
        assert!(!parsed.steps[0].title.contains("secret"));
        assert!(!parsed.explanation.contains("private-key"));
    }

    #[test]
    fn unfinished_or_blocked_tasks_are_never_finalized_as_completed() {
        let mut task = running_task("u");
        task.steps = parse_task_plan(&plan("pending").to_string()).unwrap().steps;
        finalize_task_state(&mut task);
        assert_eq!(task.status, "interrupted");
        task.steps[0].status = "completed".into();
        task.reason = Some("Connection changed".into());
        finalize_task_state(&mut task);
        assert_eq!(task.status, "interrupted");
        assert_eq!(task.reason.as_deref(), Some("Connection changed"));
        task.status = "running".into();
        finalize_task_state(&mut task);
        assert_eq!(task.status, "completed");
        assert!(task.reason.is_none());
    }

    #[test]
    fn plan_checkpoint_survives_serialization_and_is_included_when_resuming() {
        let mut conversation = tests::conversation(vec![]);
        conversation.task = Some(running_task("u"));
        let mut buffer = CheckpointBuffer {
            message_id: "a".into(),
            text: String::new(),
            last_flush: Instant::now(),
        };
        let steps = parse_task_plan(&plan("in-progress").to_string())
            .unwrap()
            .steps;
        apply_checkpoint_event(
            &mut conversation,
            &mut buffer,
            &AiStreamEvent::TaskProgress {
                steps,
                explanation: "Need credentials in secure dialog".into(),
                blocked: true,
            },
        );
        let task: AiTaskState = serde_json::from_value(
            serde_json::to_value(conversation.task.as_ref().unwrap()).unwrap(),
        )
        .unwrap();
        assert_eq!(task.status, "interrupted");
        assert_eq!(task.steps[0].status, "in-progress");
        assert!(task_resume_context(&conversation, "u").contains("Verify result"));
        let legacy: AiTaskState = serde_json::from_value(
            json!({"userMessageId":"u","status":"completed","updatedAt":"1"}),
        )
        .unwrap();
        assert!(legacy.steps.is_empty());
    }

    #[test]
    fn planning_and_continuation_are_valid_for_all_provider_protocols() {
        let conversation = tests::conversation(vec![]);
        let arguments = plan("pending").to_string();
        let safe: Value = serde_json::from_str(&provider_safe_tool_arguments(&arguments)).unwrap();
        assert_eq!(safe["steps"][0]["status"], "pending");
        assert_eq!(safe["blocked"], false);
        let turn = ToolLoopTurn {
            assistant_text: "I will continue".into(),
            continuation: Default::default(),
            calls: vec![],
            results: vec![],
            follow_up: Some("Continue unfinished steps".into()),
        };
        let chat = provider_history_messages_with_tools(
            &conversation,
            None,
            AiChatResponseMode::Chat,
            std::slice::from_ref(&turn),
            true,
        );
        assert!(chat[1].get("tool_calls").is_none());
        let responses =
            responses_input_items_with_tools(&conversation, std::slice::from_ref(&turn));
        let anthropic =
            anthropic_history_messages_with_tools(&conversation, std::slice::from_ref(&turn));
        for messages in [&chat, &responses, &anthropic] {
            assert_eq!(messages.last().unwrap()["role"], "user");
            assert_eq!(
                messages.last().unwrap()["content"],
                "Continue unfinished steps"
            );
            assert!(!messages
                .iter()
                .any(|message| message["content"] == json!([])));
        }
        for kind in [
            AiProviderKind::OpenaiCompatibleChat,
            AiProviderKind::OpenaiResponses,
            AiProviderKind::AnthropicMessages,
        ] {
            let schema = task_plan_definition(kind.clone());
            let definition = if kind == AiProviderKind::OpenaiCompatibleChat {
                &schema["function"]
            } else {
                &schema
            };
            assert_eq!(definition["name"], TASK_PLAN_TOOL);
            assert!(
                system_prompt_for_request(None, AiChatResponseMode::Chat, true)
                    .contains(TASK_AGENT_PROMPT)
            );
            assert!(
                !system_prompt_for_request(None, AiChatResponseMode::Chat, false)
                    .contains(TASK_AGENT_PROMPT)
            );
        }
    }
}
