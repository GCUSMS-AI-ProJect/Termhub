#[cfg(test)]
mod task_runtime_tests {
    use super::*;

    fn message(id: &str, role: AiMessageRole, content: &str) -> AiMessage {
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

    fn target() -> AiContextTarget {
        AiContextTarget {
            tab_id: "tab".into(),
            root_tab_id: "tab".into(),
            session_type: "ssh".into(),
            session_revision: "1".into(),
            display_host: "server".into(),
            user: Some("user".into()),
            cwd: Some("/tmp".into()),
            connected: true,
            network_device: false,
        }
    }

    fn proposal() -> AiToolCallProposal {
        AiToolCallProposal {
            id: "call".into(),
            tool_name: COPILOT_EXECUTE_REMOTE_COMMAND_TOOL.into(),
            command: "touch done".into(),
            risk: AiCommandRisk::Mutating,
            target: target(),
            explanation: None,
            approval_request_id: None,
            working_directory: None,
            file_change: None,
        }
    }

    fn prepared(conversation: StoredConversation) -> PreparedChatRequest {
        PreparedChatRequest {
            request: AiChatRequest {
                request_id: "request".into(),
                conversation_id: conversation.id.clone(),
                user_message_id: "user".into(),
                assistant_message_id: "continued".into(),
            },
            provider: tests::provider("https://example.test/v1"),
            api_key: None,
            conversation,
            context_attachment: Some(AiContextAttachment {
                mode: AiContextMode::Level2,
                target: target(),
                redactions: vec![],
                truncated: false,
            }),
            prompt_context: None,
            response_mode: AiChatResponseMode::Chat,
            reasoning_effort: None,
            copilot_mode: AiCopilotMode::SemiAutomatic,
            copilot_session_generation: 0,
            source_window_label: None,
        }
    }

    fn restore(value: Value) -> StoredConversation {
        let file: StoredConversationFile = serde_json::from_value(value).unwrap();
        let (messages, _) = migrate_legacy_messages(file.messages);
        let mut conversation = tests::conversation(messages);
        conversation.task = file.task;
        conversation.context_budget = file.context_budget;
        conversation.provider_reasoning = file.provider_reasoning;
        conversation
    }

    #[test]
    fn checkpoint_retains_partial_text_completed_operation_and_cancelled_status() {
        let mut conversation =
            tests::conversation(vec![message("user", AiMessageRole::User, "create a file")]);
        conversation.task = Some(running_task("user"));
        let mut buffer = CheckpointBuffer {
            message_id: "assistant".into(),
            text: "Starting…".into(),
            last_flush: Instant::now(),
        };
        apply_checkpoint_event(
            &mut conversation,
            &mut buffer,
            &AiStreamEvent::ToolCall {
                proposal: proposal(),
            },
        );
        let result = copilot_tool_result("call", "executed", None).1;
        apply_checkpoint_event(
            &mut conversation,
            &mut buffer,
            &AiStreamEvent::ToolResult { result },
        );
        buffer.text = "Created file".into();
        apply_checkpoint_event(
            &mut conversation,
            &mut buffer,
            &stream_error_event(request_cancelled_error()),
        );
        assert_eq!(conversation.messages[1].content, "Starting…Created file");
        assert_eq!(
            conversation.messages[1].tool_activities[0]
                .result
                .as_ref()
                .unwrap()
                .status,
            "executed"
        );
        assert_eq!(conversation.task.as_ref().unwrap().status, "interrupted");
        let persisted = serde_json::to_value(&conversation).unwrap();
        let mut restored = restore(persisted);
        restored.resume_context = Some(task_resume_context(&restored, "user"));
        let request = prepared(restored);
        for protocol in ["chat", "responses", "anthropic"] {
            let values = provider_message_values(&request.conversation, protocol);
            assert_eq!(values.last().unwrap()["role"], "user");
            assert!(values
                .last()
                .unwrap()
                .to_string()
                .contains("untrusted-task-progress"));
        }
        let (_, result) = resumed_duplicate_result(&request, "touch done", "next-call").unwrap();
        assert_eq!(result.status, "executed");
        assert_eq!(result.proposal_id, "next-call");
    }

    #[test]
    fn uncertain_operation_is_not_automatically_replayed_and_changed_target_is_rejected() {
        let mut conversation = tests::conversation(vec![
            message("user", AiMessageRole::User, "task"),
            message("assistant", AiMessageRole::Assistant, ""),
        ]);
        conversation.messages[1]
            .tool_activities
            .push(AiToolActivity {
                proposal: proposal(),
                result: None,
            });
        conversation.resume_context = Some(task_resume_context(&conversation, "user"));
        let mut request = prepared(conversation);
        assert_eq!(
            resumed_duplicate_result(&request, "touch done", "retry")
                .unwrap()
                .1
                .status,
            "input-required"
        );
        request
            .context_attachment
            .as_mut()
            .unwrap()
            .target
            .display_host = "another server".into();
        assert_eq!(
            resumed_duplicate_result(&request, "touch done", "retry")
                .unwrap()
                .1
                .status,
            "target-changed"
        );
        request.conversation.resume_context = None;
        assert!(resumed_duplicate_result(&request, "touch done", "new-task").is_none());
    }

    #[test]
    fn fresh_read_only_checks_are_allowed_when_resuming() {
        let mut conversation = tests::conversation(vec![
            message("user", AiMessageRole::User, "task"),
            message("assistant", AiMessageRole::Assistant, ""),
        ]);
        let mut activity = proposal();
        activity.command = "pwd".into();
        activity.risk = AiCommandRisk::ReadOnly;
        conversation.messages[1]
            .tool_activities
            .push(AiToolActivity {
                proposal: activity,
                result: Some(copilot_tool_result("call", "executed", None).1),
            });
        conversation.resume_context = Some(task_resume_context(&conversation, "user"));
        assert!(resumed_duplicate_result(&prepared(conversation), "pwd", "fresh-read").is_none());
    }

    #[test]
    fn native_local_commands_do_not_inherit_the_posix_whitelist_or_model_risk() {
        assert_eq!(
            windows_local_command_risk("Get-Content './notes.txt'"),
            AiCommandRisk::ReadOnly
        );
        assert_eq!(
            windows_local_command_risk("Get-Content ./x; Remove-Item -Recurse C:\\Data"),
            AiCommandRisk::Destructive
        );
        assert_eq!(
            windows_local_command_risk("cmd /c format C:"),
            AiCommandRisk::Destructive
        );
        assert_eq!(
            windows_local_command_risk("Clear-Disk -Number 0"),
            AiCommandRisk::Destructive
        );
        assert_eq!(
            windows_local_command_risk("Get-Content $(Invoke-Expression $code)"),
            AiCommandRisk::Unknown
        );
        assert_eq!(
            windows_local_command_risk("powershell -EncodedCommand DATA"),
            AiCommandRisk::Unknown
        );
        let mut local = target();
        local.session_type = "local".into();
        assert!(local_command_needs_extra_approval(
            &local,
            AiCommandRisk::Unknown
        ));
        assert!(!local_command_needs_extra_approval(
            &target(),
            AiCommandRisk::Unknown
        ));
        if cfg!(windows) {
            assert_eq!(
                command_risk_for_target("npm install", Some(AiCommandRisk::ReadOnly), &local),
                AiCommandRisk::Unknown
            );
            assert_eq!(
                command_risk_for_target(
                    "Remove-Item C:\\Data",
                    Some(AiCommandRisk::ReadOnly),
                    &local
                ),
                AiCommandRisk::Destructive
            );
        }
    }

    #[test]
    fn cancelled_result_keeps_last_progress_output() {
        let mut conversation = tests::conversation(vec![]);
        let mut buffer = CheckpointBuffer {
            message_id: "assistant".into(),
            text: String::new(),
            last_flush: Instant::now(),
        };
        apply_checkpoint_event(
            &mut conversation,
            &mut buffer,
            &AiStreamEvent::ToolCall {
                proposal: proposal(),
            },
        );
        let progress = command_progress_result(
            &proposal(),
            "step 1 complete",
            Duration::from_secs(3),
            Some("background-id".into()),
        );
        apply_checkpoint_event(
            &mut conversation,
            &mut buffer,
            &AiStreamEvent::ToolProgress { result: progress },
        );
        apply_checkpoint_event(
            &mut conversation,
            &mut buffer,
            &AiStreamEvent::ToolResult {
                result: copilot_tool_result("call", "cancelled", None).1,
            },
        );
        let result = conversation.messages[0].tool_activities[0]
            .result
            .as_ref()
            .unwrap();
        assert_eq!(result.stdout.as_deref(), Some("step 1 complete"));
        assert_eq!(result.record_id.as_deref(), Some("background-id"));
    }

    #[test]
    fn closing_the_ui_after_final_save_does_not_duplicate_pending_text() {
        let mut conversation = tests::conversation(vec![message(
            "assistant",
            AiMessageRole::Assistant,
            "completed answer",
        )]);
        conversation.task = Some(running_task("user"));
        conversation.task.as_mut().unwrap().status = "completed".into();
        let mut buffer = CheckpointBuffer {
            message_id: "assistant".into(),
            text: "answer".into(),
            last_flush: Instant::now(),
        };
        apply_checkpoint_event(
            &mut conversation,
            &mut buffer,
            &stream_error_event(request_cancelled_error()),
        );
        assert_eq!(conversation.messages[0].content, "completed answer");
        assert_eq!(conversation.task.unwrap().status, "completed");
        assert!(buffer.text.is_empty());
    }

    #[test]
    fn context_projection_summarizes_old_messages_without_mutating_full_history() {
        let mut messages = vec![message(
            "project",
            AiMessageRole::User,
            "Project is TermHub; preserve SSH guardrails",
        )];
        for index in 0..24 {
            messages.push(message(
                &format!("m{index}"),
                if index % 2 == 0 {
                    AiMessageRole::Assistant
                } else {
                    AiMessageRole::User
                },
                &"历史信息".repeat(800),
            ));
        }
        messages.push(message(
            "current",
            AiMessageRole::User,
            "Continue current task",
        ));
        let conversation = tests::conversation(messages);
        let original = serde_json::to_string(&conversation.messages).unwrap();
        let budget = conversation_context_budget(&conversation);
        assert!(budget.summarized_messages > 0);
        assert!(budget
            .summary
            .as_ref()
            .unwrap()
            .contains("preserve SSH guardrails"));
        let values = provider_message_values(&conversation, "chat");
        assert!(values.last().unwrap()["content"]
            .as_str()
            .unwrap()
            .contains("Continue current task"));
        assert!(values.last().unwrap()["content"]
            .as_str()
            .unwrap()
            .contains("untrusted-conversation-memory"));
        assert_eq!(
            serde_json::to_string(&conversation.messages).unwrap(),
            original
        );
        assert_eq!(
            selected_history_messages(&conversation)[0].role,
            AiMessageRole::User
        );
    }

    #[test]
    fn resume_context_is_private_and_legacy_conversations_remain_compatible() {
        let mut conversation =
            tests::conversation(vec![message("user", AiMessageRole::User, "task")]);
        conversation.resume_context = Some("private instruction".into());
        let mut value = serde_json::to_value(&conversation).unwrap();
        assert!(value.get("resumeContext").is_none());
        value.as_object_mut().unwrap().remove("task");
        value.as_object_mut().unwrap().remove("contextBudget");
        let legacy = restore(value);
        assert!(legacy.task.is_none());
        assert!(legacy.context_budget.is_none());
    }

    #[test]
    fn long_conversations_fit_but_capacity_failures_keep_the_previous_file_intact() {
        let mut conversation = tests::conversation(
            (0..600)
                .map(|index| message(&format!("m{index}"), AiMessageRole::User, "history"))
                .collect(),
        );
        assert!(ensure_conversation_fits(&conversation).is_ok());
        conversation.messages[0].content = "a".repeat(2 * 1024 * 1024);
        assert!(ensure_conversation_fits(&conversation).is_ok());
        let path =
            std::env::temp_dir().join(format!("termhub-checkpoint-{}.json", uuid::Uuid::new_v4()));
        write_conversation_body(&path, &conversation).unwrap();
        let before = fs::read(&path).unwrap();
        conversation.messages[0].content = "a".repeat(MAX_CONVERSATION_BYTES);
        assert!(write_conversation_body(&path, &conversation).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        conversation.messages[0].content.clear();
        conversation
            .messages
            .resize_with(MAX_CONVERSATION_MESSAGES + 1, || {
                message("extra", AiMessageRole::User, "")
            });
        assert!(ensure_conversation_fits(&conversation).is_err());
        fs::remove_file(path).unwrap();
    }
}
