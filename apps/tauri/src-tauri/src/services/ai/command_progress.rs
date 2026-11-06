const COPILOT_COMMAND_TIMEOUT_MS: u64 = 30 * 60 * 1_000;

fn command_progress_result(
    proposal: &AiToolCallProposal,
    output: &str,
    elapsed: Duration,
    record_id: Option<String>,
) -> AiToolCallResult {
    let (output, _, _) = sanitize_recent_terminal_output(output);
    let output_truncated = output.chars().count() > MAX_COPILOT_TOOL_RESULT_CHARACTERS;
    let output = truncate_characters(&output, MAX_COPILOT_TOOL_RESULT_CHARACTERS);
    AiToolCallResult {
        proposal_id: proposal.id.clone(),
        status: "running".into(),
        exit_code: None,
        stdout: (!output.is_empty()).then_some(output),
        stderr: None,
        duration_ms: Some(u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX)),
        reason: None,
        record_id,
        requested_at: None,
        approved_at: None,
        completed_at: None,
        timeout_ms: Some(COPILOT_COMMAND_TIMEOUT_MS),
        output_truncated: Some(output_truncated),
        file_change_id: None,
    }
}

async fn execute_copilot_command(
    app: &AppHandle,
    proposal: &AiToolCallProposal,
    mut request: crate::services::action_review::RemoteExecRequest,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<
    (
        crate::services::action_review::RemoteExecResult,
        Option<String>,
    ),
    AppError,
> {
    let started = Instant::now();
    if proposal.target.session_type == "local" {
        request.timeout_ms = Some(COPILOT_COMMAND_TIMEOUT_MS);
        let notice_channel = channel.clone();
        let notice_proposal = proposal.clone();
        let notice_cancel = cancellation.clone();
        let last_notice = Mutex::new(Instant::now() - Duration::from_secs(1));
        let progress = Arc::new(move |output: &str| {
            let Ok(mut last) = last_notice.lock() else {
                return;
            };
            if last.elapsed() < Duration::from_millis(150) {
                return;
            }
            *last = Instant::now();
            let result = command_progress_result(&notice_proposal, output, started.elapsed(), None);
            if emit_stream_event(&notice_channel, AiStreamEvent::ToolProgress { result }).is_err() {
                notice_cancel.cancel();
            }
        });
        emit_stream_event(
            channel,
            AiStreamEvent::ToolProgress {
                result: command_progress_result(proposal, "", started.elapsed(), None),
            },
        )?;
        return crate::services::action_review::execute_local_command_cancellable(
            app,
            request,
            cancellation,
            progress,
        )
        .await
        .map(|result| (result, None));
    }
    // Keep the mature credential-prompt and native-device paths unchanged.
    // Privileged calls require synchronous authentication-result handling.
    if command_uses_synchronous_route(proposal) {
        return crate::services::action_review::execute_remote_command_cancellable(
            app,
            request,
            cancellation,
        )
        .await
        .map(|result| (result, None));
    }
    request.timeout_ms = Some(COPILOT_COMMAND_TIMEOUT_MS);
    let command = crate::services::action_review::start_background_remote_command_cancellable(
        app,
        request,
        cancellation,
    )
    .await?;
    let state = app.state::<crate::services::workspace::WorkspaceState>();
    let registry = &state.background_remote_commands;
    let command_id = command.command_id;
    // Persist the registry ID before waiting. If the renderer closes or disk
    // persistence fails, stop the command instead of leaving an orphan job.
    if let Err(error) = emit_stream_event(
        channel,
        AiStreamEvent::ToolProgress {
            result: command_progress_result(
                proposal,
                "",
                started.elapsed(),
                Some(command_id.clone()),
            ),
        },
    ) {
        let _ = registry
            .terminate(&proposal.target.tab_id, &command_id)
            .await;
        return Err(error);
    }
    let mut offset = 0;
    let mut output = String::new();
    loop {
        let target_changed = state
            .ai_session_revision(&proposal.target.tab_id)
            .await
            .to_string()
            != proposal.target.session_revision;
        if cancellation.is_cancelled() || target_changed {
            let _ = registry
                .terminate(&proposal.target.tab_id, &command_id)
                .await;
        }
        let snapshot = registry
            .read(
                &proposal.target.tab_id,
                &command_id,
                offset,
                64 * 1024,
                Duration::from_millis(250),
            )
            .await
            .map_err(|error| ai_error("AI_TOOL_EXECUTION_FAILED", sanitize_review_error(&error)))?;
        offset = snapshot.next_offset;
        // The registry caps retained output at 256 KiB. Keep the same bound.
        if output.len() < 256 * 1024 {
            output.push_str(&snapshot.output);
        }
        if snapshot.running {
            if let Err(error) = emit_stream_event(
                channel,
                AiStreamEvent::ToolProgress {
                    result: command_progress_result(
                        proposal,
                        &output,
                        started.elapsed(),
                        Some(command_id.clone()),
                    ),
                },
            ) {
                let _ = registry
                    .terminate(&proposal.target.tab_id, &command_id)
                    .await;
                return Err(error);
            }
        } else {
            let _ = registry.close(&proposal.target.tab_id, &command_id).await;
            if target_changed {
                return Err(ai_error(
                    "AI_CONTEXT_TARGET_CHANGED",
                    "远程会话已变化，后台任务已停止",
                ));
            }
            return Ok((
                crate::services::action_review::RemoteExecResult {
                    output,
                    exit_code: snapshot.exit_code,
                    timed_out: snapshot.timed_out,
                    output_truncated: snapshot.output_truncated,
                    raw_terminal: false,
                    input_required: false,
                    input_kind: None,
                },
                Some(command_id),
            ));
        }
    }
}

fn command_uses_synchronous_route(proposal: &AiToolCallProposal) -> bool {
    proposal.target.session_type != "local"
        && (proposal.target.network_device
            || crate::services::action_review::command_needs_privileged_auth(&proposal.command)
            || proposal.risk == AiCommandRisk::Privileged)
}
