// Opaque provider state belongs to a request's tool loop, never to UI events.
// Gemini signatures and Claude thinking blocks must be replayed unchanged;
// DeepSeek and Kimi require reasoning_content beside the assistant tool call.
#[derive(Clone, Debug, Default)]
struct ProviderContinuation {
    reasoning_content: Option<String>,
    google_thought_signature: Option<String>,
    anthropic_blocks: BTreeMap<u64, Value>,
}

const MAX_PROVIDER_CONTINUATION_BYTES: usize = 1024 * 1024;

fn continuation_limit_error() -> AppError {
    ai_error(
        "AI_PROVIDER_RESPONSE_INVALID",
        "AI Provider continuation metadata exceeds the response limit",
    )
}

fn append_provider_continuation_text(target: &mut String, text: &str) -> Result<(), AppError> {
    if target.len().saturating_add(text.len()) > MAX_PROVIDER_CONTINUATION_BYTES {
        return Err(continuation_limit_error());
    }
    target.push_str(text);
    Ok(())
}

fn google_thought_signature(value: &Value) -> Result<Option<String>, AppError> {
    let signature = value
        .pointer("/extra_content/google/thought_signature")
        .and_then(Value::as_str)
        .filter(|signature| !signature.is_empty());
    if signature.is_some_and(|signature| signature.len() > MAX_PROVIDER_CONTINUATION_BYTES) {
        return Err(continuation_limit_error());
    }
    Ok(signature.map(str::to_owned))
}

fn capture_openai_continuation(
    choice: &Value,
    stream: &mut ChatStreamResult,
) -> Result<(), AppError> {
    for (field, append) in [("delta", true), ("message", false)] {
        let Some(message) = choice.get(field) else {
            continue;
        };
        if let Some(text) = message.get("reasoning_content").and_then(Value::as_str) {
            let reasoning = stream
                .continuation
                .reasoning_content
                .get_or_insert_default();
            if !append {
                reasoning.clear();
            }
            append_provider_continuation_text(reasoning, text)?;
        }
        if let Some(signature) = google_thought_signature(message)? {
            stream.continuation.google_thought_signature = Some(signature);
        }
    }
    Ok(())
}

fn capture_tool_call_signature(
    stream: &mut ChatStreamResult,
    key: &str,
    call: &Value,
) -> Result<(), AppError> {
    if let Some(signature) = google_thought_signature(call)? {
        stream
            .tool_call_accumulators
            .entry(key.to_string())
            .or_default()
            .google_thought_signature = Some(signature);
    }
    Ok(())
}

fn capture_anthropic_continuation(
    payload: &Value,
    stream: &mut ChatStreamResult,
) -> Result<(), AppError> {
    let blocks = &mut stream.continuation.anthropic_blocks;
    let index = payload.get("index").and_then(Value::as_u64).unwrap_or(0);
    match payload.get("type").and_then(Value::as_str) {
        Some("content_block_start") => {
            if let Some(block) = payload.get("content_block") {
                blocks.insert(index, block.clone());
            }
        }
        Some("content_block_delta") => {
            if let (Some(block), Some(delta)) = (blocks.get_mut(&index), payload.get("delta")) {
                let field = match delta.get("type").and_then(Value::as_str) {
                    Some("text_delta") => Some("text"),
                    Some("thinking_delta") => Some("thinking"),
                    Some("signature_delta") => Some("signature"),
                    _ => None,
                };
                if let Some(field) = field {
                    if let Some(text) = delta.get(field).and_then(Value::as_str) {
                        let mut accumulated = block[field].as_str().unwrap_or_default().to_string();
                        append_provider_continuation_text(&mut accumulated, text)?;
                        block[field] = json!(accumulated);
                    }
                }
            }
        }
        Some("message") | None => {
            if let Some(content) = payload.get("content").and_then(Value::as_array) {
                *blocks = content
                    .iter()
                    .enumerate()
                    .map(|(index, block)| (index as u64, block.clone()))
                    .collect();
            }
        }
        _ => {}
    }
    if blocks
        .values()
        .map(|block| block.to_string().len())
        .sum::<usize>()
        > MAX_PROVIDER_CONTINUATION_BYTES
    {
        return Err(continuation_limit_error());
    }
    Ok(())
}

fn openai_tool_call_value(call: &ProviderToolCall) -> Value {
    let mut value = json!({
        "id": call.id,
        "type": "function",
        "function": {
            "name": call.name,
            "arguments": provider_safe_tool_arguments(&call.arguments)
        }
    });
    if let Some(signature) = &call.google_thought_signature {
        value["extra_content"] = json!({"google":{"thought_signature":signature}});
    }
    value
}

fn apply_openai_continuation(message: &mut Value, continuation: &ProviderContinuation) {
    if let Some(reasoning) = &continuation.reasoning_content {
        message["reasoning_content"] = json!(reasoning);
    }
    if let Some(signature) = &continuation.google_thought_signature {
        message["extra_content"] = json!({"google":{"thought_signature":signature}});
    }
}

fn anthropic_continuation_blocks(turn: &ToolLoopTurn) -> Option<Vec<Value>> {
    if turn.continuation.anthropic_blocks.is_empty() {
        return None;
    }
    let mut blocks = Vec::new();
    for block in turn.continuation.anthropic_blocks.values() {
        match block.get("type").and_then(Value::as_str) {
            Some("thinking" | "redacted_thinking" | "text") => blocks.push(block.clone()),
            Some("tool_use") => {
                if let Some(call) = turn.calls.iter().find(|call| block["id"] == call.id) {
                    blocks.push(json!({
                        "type":"tool_use", "id":call.id, "name":call.name,
                        "input":serde_json::from_str::<Value>(&provider_safe_tool_arguments(&call.arguments))
                            .unwrap_or_else(|_| json!({}))
                    }));
                }
            }
            _ => {}
        }
    }
    Some(blocks)
}
