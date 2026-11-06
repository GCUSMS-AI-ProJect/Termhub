// REA adapter for the existing provider tool loop. No shell text from the model.
const REA_TOOL: &str = "transterm_rea";

/// Preserve tool schemas and structured Evidence; terminal-tail trimming would
/// discard the beginning of a schema or JSON report. Redact string values in place.
fn sanitize_rea_value(value: &mut Value, depth: usize) {
    if depth > 64 {
        *value = json!("[REA nested value omitted]");
        return;
    }
    match value {
        Value::String(text) => {
            if let Ok(mut nested) = serde_json::from_str::<Value>(text) {
                if nested.is_object() || nested.is_array() {
                    sanitize_rea_value(&mut nested, depth + 1);
                    *text = nested.to_string();
                    return;
                }
            }
            let (clean, _) = strip_terminal_controls(text);
            let clean = AUTHORIZATION_RE.replace_all(&clean, "${1}[REDACTED]");
            let clean = CREDENTIAL_ASSIGNMENT_RE.replace_all(&clean, "${1}${2}[REDACTED]");
            let mut private_key = false;
            *text = clean
                .lines()
                .filter_map(|line| {
                    if line.contains("-----BEGIN") && line.contains("PRIVATE KEY-----") {
                        private_key = !line.contains("-----END");
                        Some("[REDACTED PRIVATE KEY]")
                    } else if private_key {
                        if line.contains("-----END") && line.contains("PRIVATE KEY-----") {
                            private_key = false;
                        }
                        None
                    } else {
                        Some(line)
                    }
                })
                .collect::<Vec<_>>()
                .join("\n");
        }
        Value::Array(values) => values
            .iter_mut()
            .for_each(|v| sanitize_rea_value(v, depth + 1)),
        Value::Object(values) => {
            for (key, value) in values {
                if value.is_string()
                    && matches!(
                        key.to_ascii_lowercase().as_str(),
                        "password"
                            | "passwd"
                            | "authorization"
                            | "api_key"
                            | "apikey"
                            | "access_token"
                            | "secret"
                    )
                {
                    *value = json!("[REDACTED]");
                } else {
                    sanitize_rea_value(value, depth + 1);
                }
            }
        }
        _ => {}
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReaToolArguments {
    action: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    arguments_json: String,
    #[serde(default)]
    query: String,
    #[serde(default)]
    explanation: String,
}

fn rea_tool_definition() -> Value {
    json!({
        "name": REA_TOOL,
        "description": "Use the built-in REA reverse-engineering service on the approved terminal target. Local terminals analyze this computer; SSH terminals analyze the SSH login host, without downloading remote target files. First use prepares REA 6.7.0 in a user cache. Start with action=list and a short query, use describe to obtain an exact input schema, then call using argumentsJson. Keep IDs within this answer; a subsequent user message starts a new analysis session. Tools may need Ghidra/IDA/JADX or a browser on that host. Never invent an installed engine or completed analysis.",
        "parameters": {
            "type":"object",
            "properties": {
                "action":{"type":"string","enum":["list","describe","call"]},
                "name":{"type":"string","description":"Exact REA tool name for describe/call; empty for list"},
                "argumentsJson":{"type":"string","description":"JSON object matching the described tool schema, or {} for list/describe. Never include credentials."},
                "query":{"type":"string","description":"Case-insensitive name/description filter for list; narrow the query if results are truncated"},
                "explanation":{"type":"string","description":"Short explanation of this analysis step"}
            },
            "required":["action","name","argumentsJson","query","explanation"],
            "additionalProperties":false
        }
    })
}

fn provider_tool_schemas(kind: AiProviderKind, context: Option<&AiPromptContext>) -> Vec<Value> {
    let mut schemas = vec![match kind {
        AiProviderKind::OpenaiCompatibleChat => openai_chat_tool_schema(),
        AiProviderKind::OpenaiResponses => responses_tool_schema(),
        AiProviderKind::AnthropicMessages => anthropic_tool_schema(),
    }];
    schemas.push(task_plan_definition(kind.clone()));
    if context.is_some_and(|context| !context.network_device) {
        schemas.push(file_tool_definition(kind.clone()));
    }
    if context.is_some_and(|context| context.rea_enabled && !context.network_device) {
        let mut definition = rea_tool_definition();
        schemas.push(match kind {
            AiProviderKind::OpenaiCompatibleChat => {
                definition["strict"] = json!(true);
                json!({"type":"function","function":definition})
            }
            AiProviderKind::OpenaiResponses => {
                definition["type"] = json!("function");
                definition["strict"] = json!(true);
                definition
            }
            AiProviderKind::AnthropicMessages => {
                let parameters = definition
                    .as_object_mut()
                    .expect("tool object")
                    .remove("parameters");
                definition["input_schema"] = parameters.unwrap_or_default();
                definition
            }
        });
    }
    schemas
}

fn parse_rea_arguments(call: &ProviderToolCall) -> Result<ReaToolArguments, AppError> {
    if call.arguments.len() > 64 * 1024 {
        return Err(ai_error("REA_ARGUMENTS", "REA 参数超过 64 KiB"));
    }
    let args: ReaToolArguments = serde_json::from_str(&call.arguments)
        .map_err(|e| ai_error("REA_ARGUMENTS", e.to_string()))?;
    if !matches!(args.action.as_str(), "list" | "describe" | "call")
        || args.name.len() > 240
        || args.query.len() > 240
    {
        return Err(ai_error("REA_ARGUMENTS", "REA 操作或工具名称无效"));
    }
    Ok(args)
}

fn rea_activity(
    prepared: &PreparedChatRequest,
    call: &ProviderToolCall,
    result: Option<AiToolCallResult>,
) -> Option<AiToolActivity> {
    let args = parse_rea_arguments(call).ok()?;
    let target = prepared.context_attachment.as_ref()?.target.clone();
    Some(AiToolActivity {
        proposal: AiToolCallProposal {
            file_change: None,
            id: call.id.clone(),
            tool_name: REA_TOOL.into(),
            command: format!("REA {} {}\n{}", args.action, args.name, args.arguments_json),
            risk: if args.action == "call" {
                AiCommandRisk::Unknown
            } else {
                AiCommandRisk::ReadOnly
            },
            target,
            explanation: Some(args.explanation),
            approval_request_id: None,
            working_directory: None,
        },
        result,
    })
}

async fn validate_rea_binding(
    app: &AppHandle,
    prepared: &PreparedChatRequest,
) -> Result<(), AppError> {
    let attachment = prepared
        .context_attachment
        .as_ref()
        .ok_or_else(|| ai_error("REA_TARGET_REQUIRED", "REA 需要当前终端的 L2 上下文"))?;
    let label = prepared
        .source_window_label
        .as_deref()
        .ok_or_else(|| ai_error("REA_TARGET_REQUIRED", "REA 缺少窗口绑定"))?;
    let mode = mode_state_for_window(label)?;
    if rea_request_token(prepared).is_none() {
        return Err(ai_error(
            "REA_DISABLED",
            "REA 已关闭，请在当前终端的 AI 面板中点击“开启 REA”",
        ));
    }
    if !copilot_mode_state_is_current(
        &mode,
        prepared.copilot_mode,
        prepared.copilot_session_generation,
    ) {
        return Err(ai_error("REA_MODE_CHANGED", "AI 模式已变化"));
    }
    let (current, _) = resolve_context_target(
        app,
        &attachment.target.tab_id,
        Some(&attachment.target.root_tab_id),
        false,
    )
    .await?;
    if current != attachment.target || current.network_device {
        return Err(ai_error("REA_TARGET_CHANGED", "分析目标已变化或不支持 REA"));
    }
    Ok(())
}

async fn execute_rea_tool_call(
    app: &AppHandle,
    prepared: &PreparedChatRequest,
    call: &ProviderToolCall,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
    client: &mut Option<crate::services::rea::ReaClient>,
) -> Result<(ToolLoopResult, AiToolCallResult), AppError> {
    let started = Instant::now();
    let activation = rea_request_token(prepared).unwrap_or_else(|| {
        let token = CancellationToken::new();
        token.cancel();
        token
    });
    let mut pending_approval = None;
    let operation = async {
        let args = parse_rea_arguments(call)?;
        validate_rea_binding(app, prepared).await?;
        let mut activity = rea_activity(prepared, call, None)
            .ok_or_else(|| ai_error("REA_ARGUMENTS", "REA 参数无效"))?;
        let target = &activity.proposal.target;
        // Show progress before preparation/download/handshake, including first use.
        emit_stream_event(
            channel,
            AiStreamEvent::ToolCall {
                proposal: activity.proposal.clone(),
            },
        )?;
        if client.is_none() {
            *client = Some(
                crate::services::rea::connect(
                    app,
                    &target.tab_id,
                    &target.session_revision,
                    cancellation,
                )
                .await?,
            );
        }
        let rea = client.as_mut().expect("connected REA");
        if args.action == "list" {
            let query = args.query.to_lowercase();
            let matches: Vec<_> = rea
                .tools
                .iter()
                .filter(|tool| {
                    format!(
                        "{} {}",
                        tool["name"].as_str().unwrap_or_default(),
                        tool["description"].as_str().unwrap_or_default()
                    )
                    .to_lowercase()
                    .contains(&query)
                })
                .collect();
            return Ok(
                json!({"server":rea.server,"total":matches.len(),"truncated":matches.len()>30,
                "tools":matches.iter().take(30).map(|tool| json!({"name":tool["name"],"description":truncate_characters(tool["description"].as_str().unwrap_or_default(),400),"annotations":tool["annotations"]})).collect::<Vec<_>>() }),
            );
        }
        let tool = rea
            .tools
            .iter()
            .find(|t| t["name"] == args.name)
            .cloned()
            .ok_or_else(|| ai_error("REA_TOOL_NOT_FOUND", "先使用 list 查询准确工具名称"))?;
        if args.action == "describe" {
            return Ok(tool);
        }
        let arguments: Value = serde_json::from_str(&args.arguments_json)
            .map_err(|e| ai_error("REA_ARGUMENTS", e.to_string()))?;
        if !arguments.is_object() {
            return Err(ai_error("REA_ARGUMENTS", "argumentsJson 必须是 JSON 对象"));
        }
        let read_only = tool["annotations"]["readOnlyHint"] == true;
        let destructive = tool["annotations"]["destructiveHint"] == true;
        activity.proposal.risk = if destructive {
            AiCommandRisk::Destructive
        } else if read_only {
            AiCommandRisk::ReadOnly
        } else {
            AiCommandRisk::Unknown
        };
        if prepared.copilot_mode == AiCopilotMode::SemiAutomatic {
            let id = format!("action-approval-{}", uuid::Uuid::new_v4());
            pending_approval = Some(id.clone());
            activity.proposal.approval_request_id = Some(id.clone());
            emit_stream_event(
                channel,
                AiStreamEvent::ToolCall {
                    proposal: activity.proposal.clone(),
                },
            )?;
            let decision =
                crate::services::action_review::request_action_approval_with_id_and_target(
                    app,
                    id.clone(),
                    crate::services::action_review::ActionApprovalSource::AiCopilot,
                    "ai_copilot_rea",
                    crate::services::action_review::ActionApprovalDetails {
                        title: format!("REA · {}", args.name),
                        summary: args.explanation.clone(),
                        target: Some(review_target_label(target)),
                        details: Some(args.arguments_json.clone()),
                        destructive,
                        requires_risk_acknowledgement: destructive,
                    },
                    None,
                );
            let approved = tokio::select! {
                _ = cancellation.cancelled() => {
                    let _ = crate::services::action_review::resolve_action_approval_decision(app, &id, crate::services::action_review::ActionApprovalDecision::Dismissed).await;
                    return Err(request_cancelled_error());
                },
                result = decision => matches!(result?, crate::services::action_review::ActionApprovalDecision::Approved),
            };
            if !approved {
                return Err(ai_error("REA_REJECTED", "用户取消了这次 REA 调用"));
            }
        } else {
            let label = prepared.source_window_label.as_deref().unwrap_or_default();
            let state = mode_state_for_window(label)?;
            if state.dangerous_command_restrictions_enabled && (!read_only || destructive) {
                return Err(ai_error("REA_APPROVAL_REQUIRED", "该 REA 工具可能产生副作用，请切换半自动模式审批，或调整全自动模式的危险操作限制"));
            }
        }
        validate_rea_binding(app, prepared).await?;
        let result = rea
            .request(
                "tools/call",
                json!({"name":args.name,"arguments":arguments}),
                cancellation,
            )
            .await
            .map_err(|e| ai_error("REA_CALL", &e))?;
        if result["isError"] == true {
            return Err(ai_error(
                "REA_TOOL_ERROR",
                truncate_characters(&result.to_string(), 8192),
            ));
        }
        Ok(result)
    };
    let execution: Result<Value, AppError> = tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err(request_cancelled_error()),
        _ = activation.cancelled() => Err(ai_error("REA_DISABLED", "REA 已关闭，分析调用已停止")),
        result = operation => result,
    };
    if let Some(id) = pending_approval {
        let _ = crate::services::action_review::resolve_action_approval_decision(
            app,
            &id,
            crate::services::action_review::ActionApprovalDecision::Dismissed,
        )
        .await;
    }
    let (mut loop_result, mut result) = match execution {
        Ok(mut value) => {
            sanitize_rea_value(&mut value, 0);
            let output = serde_json::to_string_pretty(&value).unwrap_or_default();
            let truncated = output.chars().count() > 60000;
            let output = truncate_characters(&output, 60000);
            let (loop_result, mut result) = copilot_tool_result(&call.id, "executed", None);
            result.stdout = Some(output);
            result.output_truncated = Some(truncated);
            if truncated {
                result.reason = Some(
                    "REA output truncated to 60000 characters; request a narrower result.".into(),
                );
            }
            (loop_result, result)
        }
        Err(error) => {
            if let Some(mut rea) = client.take() {
                rea.close().await;
            }
            let reason = sanitize_review_error(&error.to_string());
            let status = if cancellation.is_cancelled() {
                "cancelled"
            } else if reason.contains("REJECTED") {
                "rejected"
            } else if reason.contains("TARGET_CHANGED") {
                "target-changed"
            } else if reason.contains("TIMEOUT") {
                "timeout"
            } else {
                "failed"
            };
            copilot_tool_result(&call.id, status, Some(reason))
        }
    };
    result.duration_ms = Some(u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX));
    result.timeout_ms = Some(180000);
    loop_result.content = copilot_tool_result_content(&result);
    Ok((loop_result, result))
}
