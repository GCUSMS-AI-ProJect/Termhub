fn request_cancelled_error() -> AppError {
    ai_error("AI_REQUEST_CANCELLED", "已停止 AI 回复")
}

async fn run_chat_request(
    app: &AppHandle,
    prepared: &PreparedChatRequest,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<(), AppError> {
    emit_stream_event(
        channel,
        AiStreamEvent::Started {
            request_id: prepared.request.request_id.clone(),
            message_id: prepared.request.assistant_message_id.clone(),
        },
    )?;

    let budget = conversation_context_budget(&prepared.conversation);
    emit_stream_event(
        channel,
        AiStreamEvent::ContextBudget {
            estimated_tokens: budget.estimated_tokens,
            budget_tokens: budget.budget_tokens,
            summarized_messages: budget.summarized_messages,
            summary: budget.summary.clone(),
        },
    )?;

    let semaphore = CHAT_REQUEST_SEMAPHORE.clone();
    let _permit = tokio::select! {
        _ = cancellation.cancelled() => return Err(request_cancelled_error()),
        permit = semaphore.acquire_owned() => permit.map_err(|_| {
            ai_error("AI_CONVERSATION_LIMIT", "AI 对话队列当前不可用，请稍后重试")
        })?,
    };

    let tools_enabled = prepared.copilot_mode.uses_tools();
    let mut rea_client = None;
    let mut tool_turns = Vec::new();
    let mut content = String::new();
    let mut assistant_messages = Vec::new();
    let mut finish_reason = None;
    let mut input_tokens = None;
    let mut output_tokens = None;
    let mut completed_without_tool_call = false;
    let mut tool_calls_allowed = tools_enabled;
    let mut task_steps = prepared
        .conversation
        .task
        .as_ref()
        .map(|task| task.steps.clone())
        .unwrap_or_default();
    let mut premature_stops = 0;
    for iteration in 0..MAX_COPILOT_TOOL_ITERATIONS {
        let assistant_message_id = if iteration == 0 {
            prepared.request.assistant_message_id.clone()
        } else {
            let message_id = crate::storage::new_id("ai-message");
            emit_stream_event(
                channel,
                AiStreamEvent::AssistantMessageStarted {
                    message_id: message_id.clone(),
                },
            )?;
            message_id
        };
        // A user may copy a proposed command into the visible terminal and
        // run it there while the Copilot tool turn is waiting for a decision.
        // Re-read the approved target before every follow-up provider turn so
        // the final answer can use that new terminal evidence without ever
        // treating a changed target as the same session.
        let mut prompt_context = if iteration == 0 {
            prepared.prompt_context.clone()
        } else {
            refresh_copilot_prompt_context(app, prepared).await?
        };
        if let Some(context) = prompt_context.as_mut() {
            context.rea_enabled = rea_request_token(prepared).is_some();
        }
        let target_tokens = prompt_context
            .as_ref()
            .map(|context| estimate_text_tokens(&context.preview))
            .unwrap_or_default();
        let projected_turns = project_tool_loop_context(
            &tool_turns,
            budget.estimated_tokens + target_tokens,
            &task_steps,
        );
        emit_stream_event(
            channel,
            AiStreamEvent::ContextBudget {
                estimated_tokens: budget.estimated_tokens
                    + tool_loop_context_tokens(&projected_turns)
                    + target_tokens,
                budget_tokens: budget.budget_tokens,
                summarized_messages: budget.summarized_messages,
                summary: budget.summary.clone(),
            },
        )?;
        let stream = match prepared.provider.kind {
            AiProviderKind::OpenaiCompatibleChat => {
                stream_openai_compatible_chat_with_tools(
                    &prepared.provider,
                    prepared.api_key.as_deref(),
                    &prepared.conversation,
                    prompt_context.as_ref(),
                    prepared.response_mode,
                    prepared.reasoning_effort,
                    &projected_turns,
                    tool_calls_allowed,
                    channel,
                    cancellation,
                )
                .await?
            }
            AiProviderKind::OpenaiResponses => {
                stream_openai_responses_with_tools(
                    &prepared.provider,
                    prepared.api_key.as_deref(),
                    &prepared.conversation,
                    prompt_context.as_ref(),
                    prepared.response_mode,
                    prepared.reasoning_effort,
                    &projected_turns,
                    tool_calls_allowed,
                    channel,
                    cancellation,
                )
                .await?
            }
            AiProviderKind::AnthropicMessages => {
                stream_anthropic_messages_with_tools(
                    &prepared.provider,
                    prepared.api_key.as_deref(),
                    &prepared.conversation,
                    prompt_context.as_ref(),
                    prepared.response_mode,
                    prepared.reasoning_effort,
                    &projected_turns,
                    tool_calls_allowed,
                    channel,
                    cancellation,
                )
                .await?
            }
        };
        if cancellation.is_cancelled() {
            return Err(request_cancelled_error());
        }
        if content
            .chars()
            .count()
            .saturating_add(stream.content.chars().count())
            > MAX_ASSISTANT_MESSAGE_LENGTH
        {
            return Err(ai_error(
                "AI_CONVERSATION_LIMIT",
                "Copilot 多轮回答超过本地对话长度限制",
            ));
        }
        if stream.tool_calls.len() > MAX_COPILOT_TOOL_CALLS_PER_TURN {
            return Err(ai_error(
                "AI_TOOL_LOOP_LIMIT",
                "Copilot 单轮工具调用数量超过上限",
            ));
        }
        let iteration_content = stream.content.clone();
        content.push_str(&iteration_content);
        input_tokens = match (input_tokens, stream.input_tokens) {
            (Some(total), Some(current)) => Some(total.saturating_add(current)),
            (Some(total), None) | (None, Some(total)) => Some(total),
            (None, None) => None,
        };
        output_tokens = match (output_tokens, stream.output_tokens) {
            (Some(total), Some(current)) => Some(total.saturating_add(current)),
            (Some(total), None) | (None, Some(total)) => Some(total),
            (None, None) => None,
        };
        finish_reason = stream.finish_reason.clone();
        if !tool_calls_allowed || stream.tool_calls.is_empty() {
            if !iteration_content.trim().is_empty() {
                assistant_messages.push(AssistantMessageDraft {
                    id: assistant_message_id,
                    content: iteration_content.clone(),
                    tool_activities: Vec::new(),
                    reasoning_content: stream.continuation.reasoning_content.clone(),
                });
            }
            if tool_calls_allowed
                && unfinished_task_steps(&task_steps)
                && premature_stops < 2
                && iteration + 1 < MAX_COPILOT_TOOL_ITERATIONS
            {
                premature_stops += 1;
                tool_turns.push(ToolLoopTurn {
                    assistant_text: iteration_content,
                    continuation: stream.continuation,
                    calls: vec![], results: vec![],
                    follow_up: Some("The task plan still has unfinished steps. Continue with the approved tools, verify results, and update the plan. If you genuinely need user input or action, update the plan with blocked=true and a concrete reason. Do not claim completion without evidence.".into()),
                });
                continue;
            }
            completed_without_tool_call = true;
            break;
        }

        let mut results = Vec::with_capacity(stream.tool_calls.len());
        let mut iteration_tool_activities = Vec::new();
        for call in &stream.tool_calls {
            let (loop_result, public_result) = if tool_calls_allowed {
                if call.name == TASK_PLAN_TOOL {
                    execute_task_plan(call, channel, &mut task_steps)?
                } else if call.name == REA_TOOL {
                    execute_rea_tool_call(
                        app,
                        prepared,
                        call,
                        channel,
                        cancellation,
                        &mut rea_client,
                    )
                    .await?
                } else if call.name == FILE_EDIT_TOOL {
                    execute_file_tool_call(app, prepared, call, channel, cancellation).await?
                } else {
                    execute_copilot_tool_call(app, prepared, call, channel, cancellation).await?
                }
            } else {
                copilot_tool_blocked_after_failure(&call.id)
            };
            if let Some(activity) = persisted_copilot_tool_activity(prepared, call, &public_result)
            {
                iteration_tool_activities.push(activity);
            }
            emit_stream_event(
                channel,
                AiStreamEvent::ToolResult {
                    result: public_result.clone(),
                },
            )?;
            if cancellation.is_cancelled() {
                return Err(request_cancelled_error());
            }
            if !copilot_tool_result_allows_follow_up(&public_result) {
                tool_calls_allowed = false;
                emit_stream_event(
                    channel,
                    AiStreamEvent::TaskProgress {
                        steps: task_steps.clone(),
                        explanation: public_result
                            .reason
                            .clone()
                            .unwrap_or_else(|| "操作未完成，等待用户确认后继续".into()),
                        blocked: true,
                    },
                )?;
            }
            results.push(loop_result);
        }
        if !iteration_content.trim().is_empty() || !iteration_tool_activities.is_empty() {
            assistant_messages.push(AssistantMessageDraft {
                id: assistant_message_id,
                content: iteration_content.clone(),
                tool_activities: iteration_tool_activities,
                reasoning_content: stream.continuation.reasoning_content.clone(),
            });
        }
        tool_turns.push(ToolLoopTurn {
            follow_up: None,
            assistant_text: iteration_content,
            continuation: stream.continuation,
            calls: stream
                .tool_calls
                .iter()
                .map(provider_safe_tool_call)
                .collect(),
            results,
        });
        if iteration + 1 == MAX_COPILOT_TOOL_ITERATIONS {
            return Err(ai_error(
                "AI_TOOL_LOOP_LIMIT",
                "Copilot 工具调用已达到单次回答的循环上限",
            ));
        }
    }
    if !completed_without_tool_call {
        return Err(ai_error(
            "AI_TOOL_LOOP_LIMIT",
            "Copilot 工具调用未能在限制内完成",
        ));
    }
    if let Some(mut client) = rea_client {
        client.close().await;
    }
    let conversation = append_assistant_messages(
        app,
        &prepared.request,
        &prepared.provider,
        assistant_messages,
    )?;
    if input_tokens.is_some() || output_tokens.is_some() {
        emit_stream_event(
            channel,
            AiStreamEvent::Usage {
                input_tokens,
                output_tokens,
            },
        )?;
    }
    emit_stream_event(
        channel,
        AiStreamEvent::Completed {
            conversation,
            finish_reason,
        },
    )
}
