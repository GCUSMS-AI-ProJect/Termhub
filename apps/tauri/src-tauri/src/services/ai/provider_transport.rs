// Provider HTTP clients, streaming entry points, and provider checks.
const MAX_MODEL_LIST_ITEMS: usize = 1_000;

#[cfg(test)]
#[allow(clippy::too_many_arguments)]
async fn stream_openai_compatible_chat(
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    conversation: &StoredConversation,
    context: Option<&AiPromptContext>,
    response_mode: AiChatResponseMode,
    reasoning_effort: Option<AiReasoningEffort>,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<ChatStreamResult, AppError> {
    stream_openai_compatible_chat_with_tools(
        provider,
        api_key,
        conversation,
        context,
        response_mode,
        reasoning_effort,
        &[],
        false,
        channel,
        cancellation,
    )
    .await
}

// Provider adapters intentionally spell out the protocol boundary: the
// provider, secret, conversation projection, tool history, stream channel and
// cancellation token must remain independently auditable.
#[allow(clippy::too_many_arguments)]
async fn stream_openai_compatible_chat_with_tools(
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    conversation: &StoredConversation,
    context: Option<&AiPromptContext>,
    response_mode: AiChatResponseMode,
    reasoning_effort: Option<AiReasoningEffort>,
    tool_turns: &[ToolLoopTurn],
    tools_enabled: bool,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<ChatStreamResult, AppError> {
    let client = chat_client(provider)?;
    let request_url = chat_completions_url(provider)?;
    let mut payload = json!({
        "model": provider.model,
        "messages": provider_history_messages_with_tools(
            conversation,
            context,
            response_mode,
            tool_turns,
            tools_enabled,
        ),
        "stream": true
    });
    apply_stored_provider_reasoning(&mut payload, conversation, provider);
    if tools_enabled {
        payload["tools"] = json!(provider_tool_schemas(provider.kind.clone(), context));
        payload["tool_choice"] = json!("auto");
    }
    apply_openai_compatible_reasoning(&mut payload, provider, reasoning_effort);
    let mut request = client
        .post(request_url)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .json(&payload);
    if let Some(api_key) = api_key {
        request = request.bearer_auth(api_key);
    }
    let response = send_streaming_request(request, cancellation).await?;
    consume_streaming_response(response, cancellation, channel, process_openai_payload).await
}

#[cfg(test)]
#[allow(clippy::too_many_arguments)]
async fn stream_openai_responses(
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    conversation: &StoredConversation,
    context: Option<&AiPromptContext>,
    response_mode: AiChatResponseMode,
    reasoning_effort: Option<AiReasoningEffort>,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<ChatStreamResult, AppError> {
    stream_openai_responses_with_tools(
        provider,
        api_key,
        conversation,
        context,
        response_mode,
        reasoning_effort,
        &[],
        false,
        channel,
        cancellation,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn stream_openai_responses_with_tools(
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    conversation: &StoredConversation,
    context: Option<&AiPromptContext>,
    response_mode: AiChatResponseMode,
    reasoning_effort: Option<AiReasoningEffort>,
    tool_turns: &[ToolLoopTurn],
    tools_enabled: bool,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<ChatStreamResult, AppError> {
    let client = chat_client(provider)?;
    let request_url = responses_url(provider)?;
    let tool_policy_enabled = tools_enabled || !tool_turns.is_empty();
    let mut payload = json!({
        "model": provider.model,
        "instructions": system_prompt_for_request(context, response_mode, tool_policy_enabled),
        "input": responses_input_items_with_tools(conversation, tool_turns),
        "stream": true,
        "store": false
    });
    if tools_enabled {
        payload["tools"] = json!(provider_tool_schemas(provider.kind.clone(), context));
        payload["tool_choice"] = json!("auto");
    }
    apply_model_reasoning(
        &mut payload,
        provider,
        reasoning_effort,
        AiModelReasoningParameter::ReasoningObject,
    );
    let mut request = client
        .post(request_url)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .json(&payload);
    if let Some(api_key) = api_key {
        request = request.bearer_auth(api_key);
    }
    let response = send_streaming_request(request, cancellation).await?;
    consume_streaming_response(
        response,
        cancellation,
        channel,
        process_openai_responses_payload,
    )
    .await
}

#[cfg(test)]
#[allow(clippy::too_many_arguments)]
async fn stream_anthropic_messages(
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    conversation: &StoredConversation,
    context: Option<&AiPromptContext>,
    response_mode: AiChatResponseMode,
    reasoning_effort: Option<AiReasoningEffort>,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<ChatStreamResult, AppError> {
    stream_anthropic_messages_with_tools(
        provider,
        api_key,
        conversation,
        context,
        response_mode,
        reasoning_effort,
        &[],
        false,
        channel,
        cancellation,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn stream_anthropic_messages_with_tools(
    provider: &StoredAiProvider,
    api_key: Option<&str>,
    conversation: &StoredConversation,
    context: Option<&AiPromptContext>,
    response_mode: AiChatResponseMode,
    reasoning_effort: Option<AiReasoningEffort>,
    tool_turns: &[ToolLoopTurn],
    tools_enabled: bool,
    channel: &Channel<AiStreamEvent>,
    cancellation: &CancellationToken,
) -> Result<ChatStreamResult, AppError> {
    let client = chat_client(provider)?;
    let request_url = anthropic_messages_url(provider)?;
    let tool_policy_enabled = tools_enabled || !tool_turns.is_empty();
    let mut payload = json!({
        "model": provider.model,
        "system": system_prompt_for_request(context, response_mode, tool_policy_enabled),
        "messages": anthropic_history_messages_with_tools(conversation, tool_turns),
        "max_tokens": ANTHROPIC_DEFAULT_MAX_TOKENS,
        "stream": true
    });
    if tools_enabled {
        payload["tools"] = json!(provider_tool_schemas(provider.kind.clone(), context));
        payload["tool_choice"] = json!({"type": "auto"});
    }
    apply_model_reasoning(
        &mut payload,
        provider,
        reasoning_effort,
        AiModelReasoningParameter::OutputConfigEffort,
    );
    let mut request = client
        .post(request_url)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .header("anthropic-version", ANTHROPIC_API_VERSION)
        .json(&payload);
    if let Some(api_key) = api_key {
        request = request.header("x-api-key", api_key);
    }
    let response = send_streaming_request(request, cancellation).await?;
    consume_streaming_response(response, cancellation, channel, process_anthropic_payload).await
}

fn resolve_test_api_key(
    secrets: &StoredProviderSecrets,
    provider_id: Option<&str>,
    patch: Option<&AiProviderSecretPatch>,
) -> Option<String> {
    let patch_value = patch.map(|patch| &patch.api_key);
    match patch_value {
        Some(SecretPatchValue::Clear) => None,
        Some(SecretPatchValue::Replace(value)) => Some(value.clone()),
        Some(SecretPatchValue::Unchanged) | None => provider_id
            .and_then(|provider_id| secrets.providers.get(provider_id))
            .map(|secret| secret.api_key.trim().to_string())
            .filter(|api_key| !api_key.is_empty()),
    }
}

fn validate_test_provider(
    provider: &StoredAiProvider,
    api_key: Option<&str>,
) -> Result<(), AppError> {
    let parsed = Url::parse(&provider.base_url)
        .map_err(|_| ai_error("AI_PROVIDER_INVALID_URL", "API 地址无效"))?;
    if api_key.is_none() && !(provider.allow_no_auth && is_trusted_loopback(&parsed)) {
        return Err(ai_error(
            "AI_PROVIDER_AUTH_REQUIRED",
            "连接测试需要 API Key；无鉴权仅允许可信 loopback 地址",
        ));
    }
    if api_key.is_some_and(|api_key| {
        api_key
            .chars()
            .any(|character| matches!(character, '\r' | '\n' | '\0'))
    }) {
        return Err(ai_error(
            "AI_PROVIDER_INVALID_CONFIG",
            "API Key 不得包含换行符",
        ));
    }
    Ok(())
}

pub async fn test_provider(
    app: &AppHandle,
    input: TestAiProviderInput,
) -> Result<AiProviderTestResult, AppError> {
    let (provider, api_key) = {
        let _guard = store_lock()?;
        let (config, secrets) = read_normalized_store(app)?;
        let existing_id = selected_existing_id(&config, input.provider.id.as_deref())?;
        let provider_id = existing_id
            .clone()
            .unwrap_or_else(|| "connection-test".to_string());
        let provider = normalize_provider(input.provider, provider_id)?;
        let api_key =
            resolve_test_api_key(&secrets, existing_id.as_deref(), input.secrets.as_ref());
        validate_test_provider(&provider, api_key.as_deref())?;
        (provider, api_key)
    };

    let client = client(&provider)?;
    run_provider_diagnostics(&client, &provider, api_key.as_deref(), &input.checks).await
}

/// Fetch the live model directory without persisting it. The settings UI uses
/// this as a DBX-style catalog refresh; configured model IDs remain the source
/// of truth and manual IDs continue to work when an endpoint has no directory.
/// Local Ollama/LM Studio results are suggestions only and never replace the
/// user's explicitly configured model.
pub async fn list_models(
    app: &AppHandle,
    input: ListAiModelsInput,
) -> Result<Vec<AiModelInfo>, AppError> {
    let mut draft = input.provider;
    let secrets_patch = input.secrets;
    let (provider, api_key) = {
        let _guard = store_lock()?;
        let (config, secrets) = read_normalized_store(app)?;
        let existing_id = selected_existing_id(&config, draft.id.as_deref())?;
        let provider_id = existing_id
            .clone()
            .unwrap_or_else(|| "model-list".to_string());
        if draft.model.trim().is_empty() {
            draft.model = draft
                .models
                .iter()
                .find(|model| !model.trim().is_empty())
                .cloned()
                .unwrap_or_else(|| "__transterm_model_list__".to_string());
        }
        let provider = normalize_provider(draft, provider_id)?;
        let api_key =
            resolve_test_api_key(&secrets, existing_id.as_deref(), secrets_patch.as_ref());
        validate_test_provider(&provider, api_key.as_deref())?;
        (provider, api_key)
    };

    let request_url = models_url(&provider)?;
    let client = client(&provider)?;
    let mut request = client
        .get(request_url)
        .header(reqwest::header::ACCEPT, "application/json");
    match &provider.kind {
        AiProviderKind::AnthropicMessages => {
            request = request.header("anthropic-version", ANTHROPIC_API_VERSION);
            if let Some(api_key) = api_key.as_deref() {
                request = request.header("x-api-key", api_key);
            }
        }
        AiProviderKind::OpenaiCompatibleChat | AiProviderKind::OpenaiResponses => {
            if let Some(api_key) = api_key.as_deref() {
                request = request.bearer_auth(api_key);
            }
        }
    }

    let response = request
        .send()
        .await
        .map_err(|error| chat_request_error(error, "获取模型列表"))?;
    if !response.status().is_success() {
        return Err(ai_error(
            "AI_PROVIDER_MODEL_LIST_HTTP_ERROR",
            format!("模型列表请求返回 HTTP {}", response.status()),
        ));
    }
    let payload = response.json::<Value>().await.map_err(|_| {
        ai_error(
            "AI_PROVIDER_MODEL_LIST_INVALID",
            "Provider 未返回有效的模型列表 JSON",
        )
    })?;
    Ok(extract_model_ids(&payload))
}

fn client(provider: &StoredAiProvider) -> Result<Client, AppError> {
    build_client(provider, REQUEST_TIMEOUT)
}

fn chat_client(provider: &StoredAiProvider) -> Result<Client, AppError> {
    build_client(provider, CHAT_REQUEST_TIMEOUT)
}

fn build_client(
    provider: &StoredAiProvider,
    request_timeout: Duration,
) -> Result<Client, AppError> {
    let mut builder = Client::builder()
        .connect_timeout(CONNECTION_TIMEOUT)
        .timeout(request_timeout)
        .redirect(Policy::none());
    if Url::parse(&provider.base_url)
        .ok()
        .is_some_and(|url| is_trusted_loopback(&url))
    {
        // A local model request must never have its request or API key
        // silently relayed through a developer machine's HTTP proxy.
        builder = builder.no_proxy();
    }
    builder.build().map_err(|_| {
        ai_error(
            "AI_PROVIDER_CONNECTION_FAILED",
            "无法初始化 AI Provider 连接",
        )
    })
}

fn chat_completions_url(provider: &StoredAiProvider) -> Result<Url, AppError> {
    Url::parse(&format!(
        "{}/chat/completions",
        provider.base_url.trim_end_matches('/')
    ))
    .map_err(|_| ai_error("AI_PROVIDER_INVALID_URL", "无法构造 Provider 请求地址"))
}

fn responses_url(provider: &StoredAiProvider) -> Result<Url, AppError> {
    Url::parse(&format!(
        "{}/responses",
        provider.base_url.trim_end_matches('/')
    ))
    .map_err(|_| ai_error("AI_PROVIDER_INVALID_URL", "无法构造 Provider 请求地址"))
}

fn anthropic_messages_url(provider: &StoredAiProvider) -> Result<Url, AppError> {
    Url::parse(&format!(
        "{}/messages",
        provider.base_url.trim_end_matches('/')
    ))
    .map_err(|_| ai_error("AI_PROVIDER_INVALID_URL", "无法构造 Provider 请求地址"))
}

fn models_url(provider: &StoredAiProvider) -> Result<Url, AppError> {
    let mut url = Url::parse(&provider.base_url)
        .map_err(|_| ai_error("AI_PROVIDER_INVALID_URL", "无法构造 Provider 模型列表地址"))?;
    let identity = format!(
        "{} {}",
        provider.base_url.to_ascii_lowercase(),
        provider.name.to_ascii_lowercase()
    );
    let is_loopback = is_trusted_loopback(&url);
    let port = url.port_or_known_default();

    if is_loopback && (port == Some(11_434) || identity.contains("ollama")) {
        url.set_path("/api/tags");
        url.set_query(None);
        return Ok(url);
    }
    if is_loopback
        && (port == Some(1_234) || identity.contains("lm studio") || identity.contains("lm-studio"))
    {
        url.set_path("/api/v1/models");
        url.set_query(None);
        return Ok(url);
    }

    let base_path = url.path().trim_end_matches('/');
    let path = if base_path.is_empty() {
        "/models".to_string()
    } else {
        format!("{base_path}/models")
    };
    url.set_path(&path);
    if identity.contains("siliconflow") {
        url.query_pairs_mut()
            .append_pair("type", "text")
            .append_pair("sub_type", "chat");
    } else {
        url.set_query(None);
    }
    Ok(url)
}

fn extract_model_ids(payload: &Value) -> Vec<AiModelInfo> {
    let mut arrays = Vec::new();
    if let Some(entries) = payload.as_array() {
        arrays.push(entries);
    }
    for key in ["data", "models"] {
        if let Some(entries) = payload.get(key).and_then(Value::as_array) {
            arrays.push(entries);
        }
    }

    let mut models = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for entries in arrays {
        for entry in entries {
            let Some(object) = entry.as_object() else {
                continue;
            };
            let type_name = object
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_ascii_lowercase();
            if type_name.contains("embedding") || type_name == "embed" {
                continue;
            }
            let Some(model_id) = ["id", "key", "name", "model"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str))
                .map(str::trim)
                .filter(|model| !model.is_empty() && model.len() <= MAX_MODEL_LENGTH)
            else {
                continue;
            };
            if seen.insert(model_id.to_string()) {
                models.push(AiModelInfo {
                    id: model_id.to_string(),
                });
                if models.len() >= MAX_MODEL_LIST_ITEMS {
                    return models;
                }
            }
        }
    }
    models
}

