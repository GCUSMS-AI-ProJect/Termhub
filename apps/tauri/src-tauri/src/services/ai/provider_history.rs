// Chat-compatible providers such as DeepSeek require reasoning_content on
// previous assistant turns when tools are enabled. This private file field
// shares the conversation's size/deletion limits and never enters public IPC.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredProviderReasoning {
    provider_id: String,
    base_url: String,
    model: String,
    content: String,
}

fn remember_provider_reasoning(
    conversation: &mut StoredConversation,
    provider: &StoredAiProvider,
    message: &AssistantMessageDraft,
) {
    if provider.kind != AiProviderKind::OpenaiCompatibleChat {
        return;
    }
    if let Some(content) = &message.reasoning_content {
        conversation.provider_reasoning.insert(
            message.id.clone(),
            StoredProviderReasoning {
                provider_id: provider.id.clone(),
                base_url: provider.base_url.clone(),
                model: provider.model.clone(),
                content: content.clone(),
            },
        );
    }
}

fn prune_provider_reasoning(conversation: &mut StoredConversation) {
    conversation.provider_reasoning.retain(|id, _| {
        conversation
            .messages
            .iter()
            .any(|message| message.id == *id && message.role == AiMessageRole::Assistant)
    });
}

fn apply_stored_provider_reasoning(
    payload: &mut Value,
    conversation: &StoredConversation,
    provider: &StoredAiProvider,
) {
    if provider.kind != AiProviderKind::OpenaiCompatibleChat
        || conversation.provider_reasoning.is_empty()
    {
        return;
    }
    let Some(messages) = payload.get_mut("messages").and_then(Value::as_array_mut) else {
        return;
    };
    // The plain and attachment projections both merge consecutive messages
    // of the same role. Match those groups, including empty tool-only messages,
    // rather than matching by text or accidentally attaching old state to a
    // current tool-loop message appended after this stored history.
    let mut group_index = 0usize;
    let mut previous_role = None;
    for message in selected_history_messages(conversation) {
        if previous_role != Some(&message.role) {
            group_index += 1; // index 0 is the system prompt
            previous_role = Some(&message.role);
        }
        if message.role != AiMessageRole::Assistant {
            continue;
        }
        let Some(reasoning) =
            conversation
                .provider_reasoning
                .get(&message.id)
                .filter(|reasoning| {
                    reasoning.provider_id == provider.id
                        && reasoning.model == provider.model
                        && reasoning.base_url.trim_end_matches('/')
                            == provider.base_url.trim_end_matches('/')
                })
        else {
            continue;
        };
        let Some(projected) = messages
            .get_mut(group_index)
            .filter(|value| value["role"] == "assistant")
        else {
            continue;
        };
        let combined =
            if let Some(previous) = projected.get("reasoning_content").and_then(Value::as_str) {
                format!("{previous}\n\n{}", reasoning.content)
            } else {
                reasoning.content.clone()
            };
        projected["reasoning_content"] = json!(combined);
    }
}
