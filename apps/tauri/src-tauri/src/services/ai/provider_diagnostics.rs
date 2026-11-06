// Explicit, isolated provider probes. They never inspect user files, run model
// tools, modify capabilities or append messages to a saved conversation.
const PROBE_TOOL: &str = "termhub_capability_probe";
const PROBE_TOKEN: &str = "TERMHUB_CAPABILITY_OK";
const PROBE_IMAGES: [(&str, &str); 3] = [
    ("RED", "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4z8BAEiJN9aiGUQ1DSgMAkPn/Afnh+ngAAAAASUVORK5CYII="),
    ("GREEN", "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFUlEQVR4nGNg+M9AGhrVMKph+GoAAJHq/wEkpOWMAAAAAElFTkSuQmCC"),
    ("BLUE", "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFUlEQVR4nGNgYPhPIhrVMKph2GoAAJLb/wFh5Z4RAAAAAElFTkSuQmCC"),
];

fn probe_error(message: impl Into<String>) -> AppError {
    ai_error("AI_PROVIDER_PROBE_FAILED", message)
}

fn provider_probe_http_error(status: reqwest::StatusCode) -> AppError {
    let hint = match status.as_u16() {
        401 => "鉴权失败：检查 API Key、服务地址和所属地域是否匹配",
        403 => "访问被拒绝：检查账号、模型权限和服务所在地域",
        404 => "地址或模型不存在：检查接口协议、Base URL 和模型 ID",
        429 => "请求受限：检查账号额度或频率限制，稍后重试",
        400 | 422 => "请求参数不受支持：检查模型是否支持本项能力及所选接口协议",
        500..=599 => "模型服务暂时异常，请稍后重试",
        _ => "请求失败，请核对服务地址和接口协议",
    };
    probe_error(format!("HTTP {} · {hint}", status.as_u16()))
}

fn probe_payload(provider: &StoredAiProvider, check: AiProviderProbeKind, image: &str) -> Value {
    let prompt = match check {
        AiProviderProbeKind::Tools => "Call termhub_capability_probe with token TERMHUB_CAPABILITY_OK exactly once. After receiving its result, reply exactly OK. Do not execute anything else.",
        AiProviderProbeKind::Image => "What is the dominant color in the attached image? Reply with exactly one word: RED, GREEN, or BLUE.",
        _ => "Reply with exactly OK.",
    };
    let streaming = check == AiProviderProbeKind::Streaming;
    let is_image = check == AiProviderProbeKind::Image;
    let mut payload = match provider.kind {
        AiProviderKind::OpenaiCompatibleChat => json!({
            "model":provider.model, "stream":streaming,
            "messages":[{"role":"user", "content": if is_image {
                json!([{"type":"text","text":prompt},{"type":"image_url","image_url":{"url":format!("data:image/png;base64,{image}")}}])
            } else { json!(prompt) }}]
        }),
        AiProviderKind::OpenaiResponses => json!({
            "model":provider.model, "stream":streaming, "store":false,
            "input":[{"role":"user","content": if is_image {
                json!([{"type":"input_text","text":prompt},{"type":"input_image","image_url":format!("data:image/png;base64,{image}")}])
            } else { json!([{"type":"input_text","text":prompt}]) }}]
        }),
        AiProviderKind::AnthropicMessages => json!({
            "model":provider.model, "stream":streaming, "max_tokens":2048,
            "messages":[{"role":"user","content": if is_image {
                json!([{"type":"text","text":prompt},{"type":"image","source":{"type":"base64","media_type":"image/png","data":image}}])
            } else { json!(prompt) }}]
        }),
    };
    if check == AiProviderProbeKind::Tools {
        let schema = json!({"type":"object","properties":{"token":{"type":"string","enum":[PROBE_TOKEN]}},"required":["token"],"additionalProperties":false});
        match provider.kind {
            AiProviderKind::OpenaiCompatibleChat => {
                payload["tools"] = json!([{"type":"function","function":{"name":PROBE_TOOL,"description":"Return a fixed diagnostic token. No host operations.","parameters":schema}}]);
                payload["tool_choice"] = json!({"type":"function","function":{"name":PROBE_TOOL}});
            }
            AiProviderKind::OpenaiResponses => {
                payload["tools"] = json!([{"type":"function","name":PROBE_TOOL,"description":"Return a fixed diagnostic token. No host operations.","parameters":schema,"strict":true}]);
                payload["tool_choice"] = json!({"type":"function","name":PROBE_TOOL});
            }
            AiProviderKind::AnthropicMessages => {
                payload["tools"] = json!([{"name":PROBE_TOOL,"description":"Return a fixed diagnostic token. No host operations.","input_schema":schema}]);
                payload["tool_choice"] = json!({"type":"tool","name":PROBE_TOOL});
            }
        }
    }
    payload
}

async fn send_probe(
    client: &Client,
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    payload: &Value,
    require_sse: bool,
) -> Result<ChatStreamResult, AppError> {
    let url = match provider.kind {
        AiProviderKind::OpenaiCompatibleChat => chat_completions_url(provider)?,
        AiProviderKind::OpenaiResponses => responses_url(provider)?,
        AiProviderKind::AnthropicMessages => anthropic_messages_url(provider)?,
    };
    let mut request = client.post(url).json(payload);
    if provider.kind == AiProviderKind::AnthropicMessages {
        request = request.header("anthropic-version", ANTHROPIC_API_VERSION);
        if let Some(key) = api_key {
            request = request.header("x-api-key", key);
        }
    } else if let Some(key) = api_key {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .await
        .map_err(|error| chat_request_error(error, "能力检测"))?;
    if !response.status().is_success() {
        return Err(provider_probe_http_error(response.status()));
    }
    if require_sse
        && !response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.to_ascii_lowercase().contains("text/event-stream"))
    {
        return Err(probe_error(
            "接口未返回 SSE 流式响应；网关可能只支持普通回复",
        ));
    }
    let processor: StreamPayloadProcessor = match provider.kind {
        AiProviderKind::OpenaiCompatibleChat => process_openai_payload,
        AiProviderKind::OpenaiResponses => process_openai_responses_payload,
        AiProviderKind::AnthropicMessages => process_anthropic_payload,
    };
    let channel = Channel::new(|_| Ok(()));
    let result =
        consume_streaming_response(response, &CancellationToken::new(), &channel, processor)
            .await?;
    if require_sse && result.finish_reason.is_none() {
        return Err(probe_error("流式回复中断：没有收到完成标记"));
    }
    Ok(result)
}

fn validate_probe_text(stream: &ChatStreamResult) -> Result<(), AppError> {
    if stream.content.trim().is_empty() {
        return Err(probe_error(
            "接口返回成功状态，但没有有效回答；请检查协议、模型或网关响应",
        ));
    }
    if stream.finish_reason.as_deref().is_some_and(|reason| {
        matches!(
            reason,
            "length" | "max_tokens" | "content_filter" | "incomplete"
        )
    }) {
        return Err(probe_error(
            "模型未完成测试回答，可能达到输出限制或内容过滤",
        ));
    }
    Ok(())
}

fn append_probe_tool_result(
    payload: &mut Value,
    provider: &StoredAiProvider,
    stream: ChatStreamResult,
) -> Result<(), AppError> {
    if stream.tool_calls.len() != 1 || stream.tool_calls[0].name != PROBE_TOOL {
        return Err(probe_error(
            "模型没有返回指定的工具调用；文本描述不算工具调用成功",
        ));
    }
    let call = &stream.tool_calls[0];
    let arguments = serde_json::from_str::<Value>(&call.arguments)
        .map_err(|_| probe_error("工具参数不是有效 JSON"))?;
    if arguments.get("token").and_then(Value::as_str) != Some(PROBE_TOKEN) {
        return Err(probe_error("工具调用参数没有通过测试校验"));
    }
    let mut assistant = json!({"role":"assistant", "content":if stream.content.is_empty() {Value::Null} else {json!(stream.content)},
        "tool_calls":[{"id":call.id,"type":"function","function":{"name":PROBE_TOOL,"arguments":call.arguments}}]});
    if let Some(signature) = &call.google_thought_signature {
        assistant["tool_calls"][0]["extra_content"] =
            json!({"google":{"thought_signature":signature}});
    }
    apply_openai_continuation(&mut assistant, &stream.continuation);
    match provider.kind {
        AiProviderKind::OpenaiCompatibleChat => {
            let messages = payload["messages"].as_array_mut().expect("probe messages");
            messages.push(assistant);
            messages.push(json!({"role":"tool","tool_call_id":call.id,"content":PROBE_TOKEN}));
        }
        AiProviderKind::OpenaiResponses => {
            let items = payload["input"].as_array_mut().expect("probe input");
            let mut function_call = json!({"type":"function_call","call_id":call.id,"name":PROBE_TOOL,"arguments":call.arguments});
            if let Some(id) = &call.item_id {
                function_call["id"] = json!(id);
            }
            items.push(function_call);
            items.push(
                json!({"type":"function_call_output","call_id":call.id,"output":PROBE_TOKEN}),
            );
        }
        AiProviderKind::AnthropicMessages => {
            let mut blocks = Vec::new();
            for block in stream.continuation.anthropic_blocks.values() {
                match block["type"].as_str() {
                    Some("thinking" | "redacted_thinking" | "text") => blocks.push(block.clone()),
                    Some("tool_use") if block["id"] == call.id => blocks.push(
                        json!({"type":"tool_use","id":call.id,"name":PROBE_TOOL,"input":arguments}),
                    ),
                    _ => {}
                }
            }
            if !blocks.iter().any(|block| block["type"] == "tool_use") {
                blocks.push(
                    json!({"type":"tool_use","id":call.id,"name":PROBE_TOOL,"input":arguments}),
                );
            }
            let messages = payload["messages"].as_array_mut().expect("probe messages");
            messages.push(json!({"role":"assistant","content":blocks}));
            messages.push(json!({"role":"user","content":[{"type":"tool_result","tool_use_id":call.id,"content":PROBE_TOKEN}]}));
        }
    }
    payload["tool_choice"] = if provider.kind == AiProviderKind::AnthropicMessages {
        json!({"type":"auto"})
    } else {
        json!("none")
    };
    Ok(())
}

async fn run_provider_probe(
    client: &Client,
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    check: AiProviderProbeKind,
) -> Result<(), AppError> {
    let image = PROBE_IMAGES[(uuid::Uuid::new_v4().as_bytes()[0] as usize) % PROBE_IMAGES.len()];
    let mut payload = probe_payload(provider, check, image.1);
    let mut stream = send_probe(
        client,
        provider,
        api_key,
        &payload,
        check == AiProviderProbeKind::Streaming,
    )
    .await?;
    if check == AiProviderProbeKind::Tools {
        append_probe_tool_result(&mut payload, provider, stream)?;
        stream = send_probe(client, provider, api_key, &payload, false).await?;
    }
    validate_probe_text(&stream)?;
    if check == AiProviderProbeKind::Image
        && stream
            .content
            .trim()
            .trim_matches(|c: char| !c.is_alphabetic())
            .to_ascii_uppercase()
            != image.0
    {
        return Err(probe_error(
            "接口接受了图片，但未正确识别测试颜色；图片理解能力尚未通过验证",
        ));
    }
    if check == AiProviderProbeKind::Tools
        && (!stream.tool_calls.is_empty()
            || !stream
                .content
                .trim()
                .trim_matches(|c: char| !c.is_alphabetic())
                .eq_ignore_ascii_case("OK"))
    {
        return Err(probe_error("已收到工具调用，但模型没有完成工具结果续接"));
    }
    Ok(())
}

async fn run_provider_diagnostics(
    client: &Client,
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    requested: &[AiProviderProbeKind],
) -> Result<AiProviderTestResult, AppError> {
    let checks = if requested.is_empty() {
        vec![AiProviderProbeKind::Connection]
    } else {
        requested.to_vec()
    };
    if checks.len() > 4 {
        return Err(probe_error("每次最多检测四项能力"));
    }
    let mut results: Vec<AiProviderProbeResult> = Vec::new();
    for check in checks {
        if results.iter().any(|result| result.check == check) {
            continue;
        }
        let start = std::time::Instant::now();
        let result = run_provider_probe(client, provider, api_key, check).await;
        results.push(AiProviderProbeResult {
            check,
            status: if result.is_ok() { "passed" } else { "failed" }.into(),
            duration_ms: start.elapsed().as_millis().min(u64::MAX as u128) as u64,
            message: result
                .map(|_| "已通过实际请求验证".into())
                .unwrap_or_else(|error| error.to_string()),
        });
    }
    let ok = results.iter().all(|result| result.status == "passed");
    Ok(AiProviderTestResult {
        ok,
        message: if ok {
            "检测通过"
        } else {
            "部分检测未通过，请查看分项结果"
        }
        .into(),
        checks: results,
    })
}

#[cfg(test)]
async fn test_openai_compatible_chat(
    client: &Client,
    provider: &StoredAiProvider,
    api_key: Option<&str>,
) -> Result<AiProviderTestResult, AppError> {
    run_provider_diagnostics(client, provider, api_key, &[]).await
}
