// Model-specific reasoning options for provider wire protocols.
fn siliconflow_budget_model(provider: &StoredAiProvider) -> bool {
    let identity = format!(
        "{} {}",
        provider.base_url.to_ascii_lowercase(),
        provider.name.to_ascii_lowercase()
    );
    if !identity.contains("siliconflow") {
        return false;
    }

    let model = provider.model.trim().to_ascii_lowercase();
    [
        "deepseek-ai/deepseek-v4-pro",
        "deepseek-ai/deepseek-v4-flash",
        "deepseek-ai/deepseek-v3.2",
        "deepseek-ai/deepseek-r1",
        "moonshotai/kimi-k2.6",
        "zai-org/glm-5.1",
        "zai-org/glm-5",
    ]
    .iter()
    .any(|candidate| model == *candidate || model.ends_with(candidate))
        || model.starts_with("qwen/qwen3-")
}

fn siliconflow_thinking_budget(effort: AiReasoningEffort) -> Option<u32> {
    match effort {
        AiReasoningEffort::Auto => None,
        AiReasoningEffort::None => Some(0),
        AiReasoningEffort::Minimal => Some(1_024),
        AiReasoningEffort::Low => Some(4_096),
        AiReasoningEffort::Medium => Some(8_192),
        AiReasoningEffort::High => Some(16_384),
        AiReasoningEffort::Xhigh => Some(24_576),
        AiReasoningEffort::Max => Some(32_768),
    }
}

fn thinking_toggle_model(provider: &StoredAiProvider) -> bool {
    let model = provider.model.trim().to_ascii_lowercase();
    [
        "glm-5.1",
        "glm-5",
        "glm-5-turbo",
        "glm-5v-turbo",
        "glm-4.7",
        "glm-4.6",
        "glm-4.6v",
        "glm-4.5",
        "glm-4.5v",
        "kimi-k2.6",
    ]
    .iter()
    .any(|candidate| {
        model == *candidate
            || model.starts_with(&format!("{candidate}-"))
            || model.starts_with(&format!("{candidate}["))
    })
}

fn dashscope_provider(provider: &StoredAiProvider) -> bool {
    Url::parse(&provider.base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_ascii_lowercase))
        .is_some_and(|host| {
            matches!(
                host.as_str(),
                "dashscope.aliyuncs.com"
                    | "dashscope-intl.aliyuncs.com"
                    | "dashscope-us.aliyuncs.com"
            ) || host.ends_with(".maas.aliyuncs.com")
        })
}

fn dashscope_toggle_model(provider: &StoredAiProvider) -> bool {
    if !dashscope_provider(provider) {
        return false;
    }
    let model = provider.model.trim().to_ascii_lowercase();
    [
        "qwen3.8-max",
        "qwen3.8-flash",
        "qwen3.8-27b",
        "qwen3.7-max",
        "qwen3.7-plus",
        "qwen3.7-flash",
        "qwen3.6-plus",
        "qwen3.6-flash",
        "qwen3.5-plus",
        "qwen3.5-flash",
        "qwen-plus",
        "qwen-turbo",
    ]
    .iter()
    .any(|candidate| model == *candidate || model.starts_with(&format!("{candidate}-")))
}

fn deepseek_reasoning_model(provider: &StoredAiProvider) -> bool {
    if siliconflow_budget_model(provider) {
        return false;
    }
    let model = provider.model.trim().to_ascii_lowercase();
    model.starts_with("deepseek-v4-flash")
        || model.starts_with("deepseek-v4-pro")
        || model.starts_with("deepseek-ai/deepseek-v4-flash")
        || model.starts_with("deepseek-ai/deepseek-v4-pro")
}

fn apply_deepseek_reasoning(payload: &mut Value, effort: AiReasoningEffort) {
    if effort == AiReasoningEffort::None {
        payload["thinking"] = json!({"type": "disabled"});
        return;
    }

    payload["thinking"] = json!({"type": "enabled"});
    let mapped_effort = match effort {
        AiReasoningEffort::Auto | AiReasoningEffort::None => None,
        AiReasoningEffort::Minimal | AiReasoningEffort::Low => Some("low"),
        AiReasoningEffort::Medium | AiReasoningEffort::High | AiReasoningEffort::Xhigh => {
            Some("high")
        }
        AiReasoningEffort::Max => Some("max"),
    };
    if let Some(mapped_effort) = mapped_effort {
        payload["reasoning_effort"] = json!(mapped_effort);
    }
}

fn model_reasoning_config(provider: &StoredAiProvider) -> Option<&AiModelReasoningConfig> {
    provider
        .model_capabilities
        .get(&provider.model)
        .map(|capabilities| &capabilities.reasoning)
}

fn model_supports_reasoning(provider: &StoredAiProvider, effort: AiReasoningEffort) -> bool {
    if effort == AiReasoningEffort::Auto {
        return true;
    }
    let Some(config) = model_reasoning_config(provider) else {
        // Keep the pre-capability behavior for existing saved Providers. The
        // The renderer only exposes explicit values for known model templates;
        // newly configured custom models remain Auto until capability metadata
        // is available.
        return true;
    };
    config.mode != AiModelReasoningMode::None && config.efforts.contains(&effort)
}

fn configured_reasoning_parameter(
    provider: &StoredAiProvider,
    default: AiModelReasoningParameter,
) -> Option<AiModelReasoningParameter> {
    let Some(config) = model_reasoning_config(provider) else {
        return Some(default);
    };
    if config.mode == AiModelReasoningMode::None {
        return None;
    }
    Some(match config.parameter {
        AiModelReasoningParameter::Auto => default,
        parameter => parameter,
    })
}

fn default_thinking_budget(effort: AiReasoningEffort) -> Option<u32> {
    siliconflow_thinking_budget(effort)
}

fn model_thinking_budget(provider: &StoredAiProvider, effort: AiReasoningEffort) -> Option<u32> {
    let key = effort.request_value()?;
    model_reasoning_config(provider)
        .and_then(|config| config.budgets.get(key).copied())
        .or_else(|| default_thinking_budget(effort))
}

fn apply_thinking_budget(
    payload: &mut Value,
    provider: &StoredAiProvider,
    effort: AiReasoningEffort,
) {
    if effort == AiReasoningEffort::None {
        payload["enable_thinking"] = json!(false);
        return;
    }
    payload["enable_thinking"] = json!(true);
    if let Some(budget) = model_thinking_budget(provider, effort) {
        payload["thinking_budget"] = json!(budget);
    }
}

fn apply_model_reasoning(
    payload: &mut Value,
    provider: &StoredAiProvider,
    reasoning_effort: Option<AiReasoningEffort>,
    default_parameter: AiModelReasoningParameter,
) {
    let Some(effort) = reasoning_effort else {
        return;
    };
    if effort == AiReasoningEffort::Auto || !model_supports_reasoning(provider, effort) {
        return;
    }
    let Some(parameter) = configured_reasoning_parameter(provider, default_parameter) else {
        return;
    };
    match parameter {
        AiModelReasoningParameter::Auto => {}
        AiModelReasoningParameter::ReasoningEffort => {
            if let Some(value) = effort.request_value() {
                payload["reasoning_effort"] = json!(value);
            }
        }
        AiModelReasoningParameter::ReasoningObject => {
            if let Some(value) = effort.request_value() {
                payload["reasoning"] = json!({"effort": value});
            }
        }
        AiModelReasoningParameter::OutputConfigEffort => {
            if let Some(value) = effort.request_value() {
                payload["output_config"] = json!({"effort": value});
            }
        }
        AiModelReasoningParameter::ThinkingToggle => {
            if dashscope_provider(provider) {
                payload["enable_thinking"] = json!(effort != AiReasoningEffort::None);
            } else {
                payload["thinking"] = json!({
                    "type": if effort == AiReasoningEffort::None {
                        "disabled"
                    } else {
                        "enabled"
                    }
                });
            }
        }
        AiModelReasoningParameter::ThinkingBudget => {
            apply_thinking_budget(payload, provider, effort);
        }
        AiModelReasoningParameter::ChatTemplateReasoningEffort => {
            if let Some(value) = effort.request_value() {
                payload["chat_template_kwargs"]["reasoning_effort"] = json!(value);
            }
        }
    }
}

fn apply_openai_compatible_reasoning(
    payload: &mut Value,
    provider: &StoredAiProvider,
    reasoning_effort: Option<AiReasoningEffort>,
) {
    if deepseek_reasoning_model(provider)
        && model_reasoning_config(provider)
            .is_none_or(|config| config.parameter == AiModelReasoningParameter::Auto)
    {
        if let Some(effort) =
            reasoning_effort.filter(|effort| model_supports_reasoning(provider, *effort))
        {
            apply_deepseek_reasoning(payload, effort);
        }
        return;
    }
    let default_parameter = if siliconflow_budget_model(provider) {
        AiModelReasoningParameter::ThinkingBudget
    } else if thinking_toggle_model(provider) || dashscope_toggle_model(provider) {
        AiModelReasoningParameter::ThinkingToggle
    } else {
        AiModelReasoningParameter::ReasoningEffort
    };
    apply_model_reasoning(payload, provider, reasoning_effort, default_parameter);
}
