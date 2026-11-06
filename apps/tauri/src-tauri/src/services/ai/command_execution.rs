// Copilot tool execution loop and chat request runtime.
async fn execute_copilot_tool_call(
    app: &AppHandle,
    prepared: &PreparedChatRequest,
    call: &ProviderToolCall,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<(ToolLoopResult, AiToolCallResult), AppError> {
    if cancellation.is_cancelled() {
        return Err(request_cancelled_error());
    }
    if call.name != COPILOT_EXECUTE_REMOTE_COMMAND_TOOL {
        return Ok(copilot_tool_result(
            &call.id,
            "invalid",
            Some("未知的 TermHub 工具名称".to_string()),
        ));
    }
    let arguments = match copilot_tool_call_arguments(call) {
        Ok(arguments) => arguments,
        Err(error) => return Ok(copilot_tool_error_result(&call.id, &error)),
    };
    let command = arguments.command;
    let explanation = arguments.explanation;
    let Some(context_attachment) = prepared.context_attachment.as_ref() else {
        return Ok(copilot_tool_result(
            &call.id,
            "target-changed",
            Some("Copilot 工具调用缺少已确认的 L2 目标".to_string()),
        ));
    };
    let risk = command_risk_for_target(&command, arguments.ai_risk, &context_attachment.target);
    let needs_approval = prepared.copilot_mode == AiCopilotMode::SemiAutomatic
        || local_command_needs_extra_approval(&context_attachment.target, risk);
    let approval_request_id = if needs_approval {
        Some(format!("action-approval-{}", uuid::Uuid::new_v4()))
    } else {
        None
    };
    let proposal = AiToolCallProposal {
        file_change: None,
        id: call.id.clone(),
        tool_name: call.name.clone(),
        command: command.clone(),
        risk,
        target: context_attachment.target.clone(),
        explanation,
        approval_request_id: approval_request_id.clone(),
        working_directory: prepared
            .conversation
            .workspace
            .as_ref()
            .map(|workspace| workspace.path.clone()),
    };
    emit_stream_event(
        channel,
        AiStreamEvent::ToolCall {
            proposal: proposal.clone(),
        },
    )?;
    if let Some(result) = resumed_duplicate_result(prepared, &command, &call.id) {
        return Ok(result);
    }

    let state = app.state::<crate::services::workspace::WorkspaceState>();
    let (current_target, _) = match resolve_context_target(
        app,
        &proposal.target.tab_id,
        Some(&proposal.target.root_tab_id),
        false,
    )
    .await
    {
        Ok(target) => target,
        Err(error) => {
            return Ok(copilot_tool_result(
                &proposal.id,
                "target-changed",
                Some(sanitize_review_error(&error.to_string())),
            ))
        }
    };
    if current_target != proposal.target {
        return Ok(copilot_tool_result(
            &proposal.id,
            "target-changed",
            Some("终端目标已变化，工具调用未执行".to_string()),
        ));
    }

    let source_window_label = prepared
        .source_window_label
        .as_deref()
        .ok_or_else(|| ai_error("AI_CONTEXT_FORBIDDEN", "Copilot 缺少来源窗口绑定"))?;
    let mode_state = mode_state_for_window(source_window_label)?;
    if !copilot_mode_state_is_current(
        &mode_state,
        prepared.copilot_mode,
        prepared.copilot_session_generation,
    ) {
        return Ok(copilot_tool_result(
            &proposal.id,
            "rejected",
            Some("Copilot 模式已变化，工具调用未执行".to_string()),
        ));
    }

    let terminal_transcript_len_before_approval = if needs_approval {
        Some(terminal_transcript_len(app, &proposal.target.tab_id).await)
    } else {
        None
    };

    if needs_approval {
        let risk_requires_acknowledgement = matches!(
            proposal.risk,
            AiCommandRisk::Destructive | AiCommandRisk::Privileged
        );
        let approval_request_id = approval_request_id
            .clone()
            .expect("semi-automatic Copilot calls always have an approval request ID");
        let approval = crate::services::action_review::request_action_approval_with_id_and_target(
            app,
            approval_request_id.clone(),
            crate::services::action_review::ActionApprovalSource::AiCopilot,
            "ai_copilot_execute_remote_command",
            crate::services::action_review::ActionApprovalDetails {
                title: "确认执行 Copilot 命令".to_string(),
                summary: if proposal.target.network_device {
                    "允许通过当前可见网络设备终端发送一条原生命令；不会打开独立 SSH exec 通道。"
                        .to_string()
                } else if proposal.target.session_type == "local" {
                    "允许使用本地终端配置的 Shell，在所示目录中启动独立命令进程。".to_string()
                } else {
                    "允许执行会使用独立 SSH 通道；也可以改为交给当前可见终端执行。".to_string()
                },
                target: Some(review_target_label(&proposal.target)),
                details: Some(format!(
                    "工作目录：{}\n风险：{}\n超时：{} 秒\n命令：\n{}",
                    proposal
                        .working_directory
                        .as_deref()
                        .or(proposal.target.cwd.as_deref())
                        .unwrap_or("~"),
                    review_risk_label(&proposal.risk),
                    if command_uses_synchronous_route(&proposal) {
                        AI_REVIEW_TIMEOUT_MS / 1_000
                    } else {
                        COPILOT_COMMAND_TIMEOUT_MS / 1_000
                    },
                    proposal.command
                )),
                destructive: matches!(
                    proposal.risk,
                    AiCommandRisk::Destructive | AiCommandRisk::Privileged
                ),
                requires_risk_acknowledgement: risk_requires_acknowledgement,
            },
            Some(
                crate::services::action_review::ActionApprovalTargetBinding {
                    tab_id: proposal.target.tab_id.clone(),
                    session_revision: proposal.target.session_revision.clone(),
                    command: proposal.command.clone(),
                },
            ),
        );
        let decision = tokio::select! {
            _ = cancellation.cancelled() => {
                let _ = crate::services::action_review::resolve_action_approval_decision(
                    app,
                    &approval_request_id,
                    crate::services::action_review::ActionApprovalDecision::Dismissed,
                ).await;
                return Err(request_cancelled_error());
            }
            result = approval => match result {
                Ok(decision) => decision,
                Err(error) => {
                    return Ok(copilot_tool_result(
                        &proposal.id,
                        "failed",
                        Some(sanitize_review_error(&error.to_string())),
                    ))
                }
            }
        };
        if cancellation.is_cancelled() {
            return Err(request_cancelled_error());
        }
        if matches!(
            decision,
            crate::services::action_review::ActionApprovalDecision::DelegatedToTerminal
        ) {
            wait_for_terminal_handoff_output(
                app,
                &proposal.target.tab_id,
                terminal_transcript_len_before_approval.unwrap_or_default(),
                cancellation,
            )
            .await;
            if cancellation.is_cancelled() {
                return Err(request_cancelled_error());
            }
            return Ok(copilot_tool_result(
                &proposal.id,
                "executed-in-terminal",
                Some(
                    "The command was handed to the visible terminal; do not execute it again through the background channel. Use the refreshed terminal context when summarizing the result.".to_string(),
                ),
            ));
        }
        if !matches!(
            decision,
            crate::services::action_review::ActionApprovalDecision::Approved
        ) {
            let terminal_command_observed = match terminal_transcript_len_before_approval {
                Some(previous_len) => {
                    terminal_command_was_observed(
                        app,
                        &proposal.target.tab_id,
                        previous_len,
                        &proposal.command,
                    )
                    .await
                }
                None => false,
            };
            if terminal_command_observed {
                wait_for_terminal_handoff_output(
                    app,
                    &proposal.target.tab_id,
                    terminal_transcript_len_before_approval.unwrap_or_default(),
                    cancellation,
                )
                .await;
                if cancellation.is_cancelled() {
                    return Err(request_cancelled_error());
                }
                return Ok(copilot_tool_result(
                    &proposal.id,
                    "executed-in-terminal",
                    Some(
                        "The same command was observed in the visible terminal after the background tool call was declined. Use the refreshed terminal context and do not execute it again through the background channel.".to_string(),
                    ),
                ));
            }
            return Ok(copilot_tool_result(
                &proposal.id,
                "rejected",
                Some(
                    decision
                        .rejection_message(
                            crate::services::action_review::ActionApprovalSource::AiCopilot,
                        )
                        .to_string(),
                ),
            ));
        }
    }

    // Approval and the guardrail check can both await local state or a
    // renderer decision. Re-read the process-local mode immediately before
    // opening the SSH exec channel so a mode switch cannot authorize a stale
    // tool call.
    let latest_mode_state = mode_state_for_window(source_window_label)?;
    if !copilot_mode_state_is_current(
        &latest_mode_state,
        prepared.copilot_mode,
        prepared.copilot_session_generation,
    ) {
        return Ok(copilot_tool_result(
            &proposal.id,
            "rejected",
            Some("Copilot 模式已变化，工具调用未执行".to_string()),
        ));
    }

    if cancellation.is_cancelled() {
        return Err(request_cancelled_error());
    }

    // Re-read the policy while holding the authoritative mode-state lock. The
    // earlier mode check is intentionally repeated here because a mode switch
    // may have happened while the collaboration approval dialog was open.
    if matches!(
        prepared.copilot_mode,
        AiCopilotMode::SemiAutomatic | AiCopilotMode::FullyAutomatic
    ) {
        let current_revision = state
            .ai_session_revision(&proposal.target.tab_id)
            .await
            .to_string();
        let registry = mode_registry_lock()?;
        let Some(latest_state) = registry.get(source_window_label) else {
            return Ok(copilot_tool_result(
                &proposal.id,
                "auto-blocked",
                Some("Copilot 护栏状态不可用，工具调用未执行".to_string()),
            ));
        };
        if !copilot_mode_state_is_current(
            latest_state,
            prepared.copilot_mode,
            prepared.copilot_session_generation,
        ) {
            return Ok(copilot_tool_result(
                &proposal.id,
                "rejected",
                Some("Copilot 模式已变化，工具调用未执行".to_string()),
            ));
        }
        if let Err(error) = crate::services::ai_guardrails::authorize_command(
            &proposal.command,
            proposal.risk,
            latest_state.dangerous_command_restrictions_enabled,
            Some(&proposal.target.session_revision),
            Some(&current_revision),
        ) {
            return Ok(copilot_tool_result(
                &proposal.id,
                "auto-blocked",
                Some(format!("{}: {}", error.code, error.reason)),
            ));
        }
        if cfg!(windows)
            && proposal.target.session_type == "local"
            && latest_state.dangerous_command_restrictions_enabled
            && matches!(
                windows_local_command_risk(&proposal.command),
                AiCommandRisk::Destructive | AiCommandRisk::Privileged
            )
        {
            return Ok(copilot_tool_result(
                &proposal.id,
                "auto-blocked",
                Some(
                    "本地命令命中 Windows 删除、磁盘、进程或提权操作限制，请在终端中自行确认执行。"
                        .into(),
                ),
            ));
        }
    }

    let waiting_channel = channel.clone();
    let waiting_proposal_id = proposal.id.clone();
    let privileged_prompt_notice: crate::services::action_review::PrivilegedPromptNotice = Arc::new(
        move |needed_code: &str| {
            let notice = "\n\nTransterm 已将主窗口置于前台，请在前台安全输入框中完成输入；当前工具调用会等待输入完成后继续执行。\n\n";
            let _ = emit_stream_event(
                &waiting_channel,
                AiStreamEvent::TextDelta {
                    text: notice.to_string(),
                },
            );
            let result = AiToolCallResult {
                file_change_id: None,
                proposal_id: waiting_proposal_id.clone(),
                status: "input-required".to_string(),
                exit_code: None,
                stdout: None,
                stderr: None,
                duration_ms: None,
                reason: Some(format!(
                    "{needed_code}: TermHub 已将主窗口置于前台，请等待用户在前台安全输入框中完成输入。"
                )),
                record_id: None,
                requested_at: None,
                approved_at: None,
                completed_at: None,
                timeout_ms: Some(AI_REVIEW_TIMEOUT_MS),
                output_truncated: None,
            };
            let _ = emit_stream_event(&waiting_channel, AiStreamEvent::ToolResult { result });
        },
    );
    let started_at = Instant::now();
    let execution = execute_copilot_command(
        app,
        &proposal,
        crate::services::action_review::RemoteExecRequest {
            tab_id: proposal.target.tab_id.clone(),
            command: proposal.command.clone(),
            cwd: proposal
                .working_directory
                .clone()
                .or(proposal.target.cwd.clone()),
            timeout_ms: Some(AI_REVIEW_TIMEOUT_MS),
            expected_session_revision: Some(proposal.target.session_revision.clone()),
            // The in-app Copilot never receives or forwards a privileged
            // credential through a model tool call. action_review resolves an
            // encrypted profile secret or opens TermHub's foreground secure
            // prompt instead.
            sudo_password: None,
            su_password: None,
            save_sudo_password: false,
            save_su_password: false,
            allow_local_privileged_prompt: true,
            privileged_prompt_notice: Some(privileged_prompt_notice),
        },
        channel,
        cancellation,
    )
    .await;
    let duration = started_at.elapsed();
    let duration_ms = u64::try_from(duration.as_millis()).unwrap_or(u64::MAX);
    let (loop_result, tool_result) = match execution {
        Ok((execution, record_id)) => {
            let (mut output, _, _) = sanitize_recent_terminal_output(&execution.output);
            if output.chars().count() > MAX_COPILOT_TOOL_RESULT_CHARACTERS {
                output = truncate_characters(&output, MAX_COPILOT_TOOL_RESULT_CHARACTERS);
            }
            let status = if cancellation.is_cancelled() {
                "cancelled"
            } else if execution.timed_out {
                "timeout"
            } else if execution.input_required {
                "input-required"
            } else if execution.raw_terminal || execution.exit_code == Some(0) {
                "executed"
            } else {
                "failed"
            };
            let tool_result = AiToolCallResult {
                file_change_id: None,
                proposal_id: proposal.id.clone(),
                status: status.to_string(),
                exit_code: execution.exit_code,
                stdout: (!output.is_empty()).then_some(output),
                stderr: None,
                duration_ms: Some(duration_ms),
                reason: if cancellation.is_cancelled() {
                    Some("任务已停止，已保留当前输出；已产生的文件或远程变更不会自动撤销。".into())
                } else if execution.timed_out {
                    Some(
                        if proposal.target.network_device {
                            "网络设备命令等待终端输出静默超时，已返回部分输出。"
                        } else {
                            "命令达到执行时限，已停止并保留部分输出。"
                        }
                        .into(),
                    )
                } else if execution.raw_terminal {
                    Some(
                        "命令已通过网络设备可见 raw PTY 发送；设备会话不提供可靠的进程 exit code。"
                            .to_string(),
                    )
                } else if execution.input_required {
                    Some(format!(
                        "{}: 该命令需要交互输入，请用户在可见 SSH 终端中完成操作后再重试。",
                        crate::services::action_review::REMOTE_INTERACTIVE_INPUT_REQUIRED
                    ))
                } else {
                    execution.timed_out.then(|| "远程命令超时".to_string())
                },
                record_id,
                requested_at: None,
                approved_at: None,
                completed_at: None,
                timeout_ms: Some(if command_uses_synchronous_route(&proposal) {
                    AI_REVIEW_TIMEOUT_MS
                } else {
                    COPILOT_COMMAND_TIMEOUT_MS
                }),
                output_truncated: Some(execution.output_truncated),
            };
            (
                ToolLoopResult {
                    call_id: proposal.id.clone(),
                    content: copilot_tool_result_content(&tool_result),
                },
                tool_result,
            )
        }
        Err(error) => {
            let reason = sanitize_review_error(&error.to_string());
            let status = if reason.contains("TARGET_CHANGED") {
                "target-changed"
            } else if reason.contains("TIMEOUT") {
                "timeout"
            } else if cancellation.is_cancelled() || reason.contains("PASSWORD_CANCELLED") {
                "cancelled"
            } else {
                "failed"
            };
            let tool_result = AiToolCallResult {
                file_change_id: None,
                proposal_id: proposal.id.clone(),
                status: status.to_string(),
                exit_code: None,
                stdout: None,
                stderr: None,
                duration_ms: Some(duration_ms),
                reason: Some(reason),
                record_id: None,
                requested_at: None,
                approved_at: None,
                completed_at: None,
                timeout_ms: Some(AI_REVIEW_TIMEOUT_MS),
                output_truncated: None,
            };
            (
                ToolLoopResult {
                    call_id: proposal.id.clone(),
                    content: copilot_tool_result_content(&tool_result),
                },
                tool_result,
            )
        }
    };
    Ok((loop_result, tool_result))
}

fn persisted_copilot_tool_activity(
    prepared: &PreparedChatRequest,
    call: &ProviderToolCall,
    result: &AiToolCallResult,
) -> Option<AiToolActivity> {
    if call.name == REA_TOOL {
        return rea_activity(prepared, call, Some(result.clone()));
    }
    if call.name != COPILOT_EXECUTE_REMOTE_COMMAND_TOOL {
        return None;
    }
    let context_attachment = prepared.context_attachment.as_ref()?;
    let arguments = copilot_tool_call_arguments(call).ok()?;
    let command = arguments.command;
    let explanation = arguments.explanation;
    let risk = command_risk_for_target(&command, arguments.ai_risk, &context_attachment.target);
    Some(AiToolActivity {
        proposal: AiToolCallProposal {
            file_change: None,
            id: call.id.clone(),
            tool_name: call.name.clone(),
            command: command.clone(),
            risk,
            target: context_attachment.target.clone(),
            explanation,
            approval_request_id: None,
            working_directory: prepared
                .conversation
                .workspace
                .as_ref()
                .map(|workspace| workspace.path.clone()),
        },
        result: Some(result.clone()),
    })
}
