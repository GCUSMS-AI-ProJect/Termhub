// Local history search and explicit branching; neither operation calls a provider.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConversationSearchResult {
    #[serde(flatten)]
    summary: AiConversationSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    snippet: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkAiConversationInput {
    conversation_id: String,
    message_id: String,
    #[serde(default)]
    before_message: bool,
}

fn conversation_match_snippet(messages: &[AiMessage], query: &str) -> Option<String> {
    messages.iter().find_map(|message| {
        message
            .content
            .lines()
            .find(|line| line.to_lowercase().contains(query))
            .map(|line| truncate_characters(line, 240))
    })
}

pub fn search_conversations(
    app: &AppHandle,
    query: &str,
    workspace_id: Option<&str>,
) -> Result<Vec<AiConversationSearchResult>, AppError> {
    let query = truncate_characters(query.trim(), 240).to_lowercase();
    let _guard = conversation_store_lock()?;
    let mut results = Vec::new();
    for summary in read_conversation_index(app)?.conversations {
        if workspace_id.is_some_and(|id| summary.workspace_id.as_deref() != Some(id)) {
            continue;
        }
        let snippet = if query.is_empty() {
            None
        } else {
            let conversation = read_stored_conversation(app, &summary.id)?;
            conversation_match_snippet(&conversation.messages, &query)
        };
        if query.is_empty() || summary.title.to_lowercase().contains(&query) || snippet.is_some() {
            results.push(AiConversationSearchResult { summary, snippet });
        }
    }
    results.sort_by(|a, b| b.summary.updated_at.cmp(&a.summary.updated_at));
    Ok(results)
}

fn fork_message_history(
    messages: &[AiMessage],
    message_id: &str,
    before: bool,
) -> Result<Vec<AiMessage>, AppError> {
    let selected = messages
        .iter()
        .position(|message| message.id == message_id)
        .ok_or_else(|| ai_error("AI_CONVERSATION_INVALID_INPUT", "找不到要分支的消息"))?;
    Ok(messages[..selected + usize::from(!before)]
        .iter()
        .cloned()
        .map(|mut message| {
            message.id = crate::storage::new_id("ai-message");
            // A branch carries readable history only. Executable approvals and host
            // authorization must be acquired for a fresh request on its actual target.
            message.context = None;
            message.tool_activities.clear();
            message
        })
        .collect())
}

pub fn fork_conversation(
    app: &AppHandle,
    input: ForkAiConversationInput,
) -> Result<AiConversation, AppError> {
    let source_id = validate_conversation_id(&input.conversation_id)?;
    let _guard = conversation_store_lock()?;
    let mut index = read_conversation_index(app)?;
    require_indexed_conversation(&index, &source_id)?;
    if index.conversations.len() >= MAX_CONVERSATIONS {
        return Err(ai_error("AI_CONVERSATION_LIMIT", "请先清理不再需要的对话"));
    }
    let mut conversation = read_stored_conversation(app, &source_id)?;
    conversation.messages = fork_message_history(
        &conversation.messages,
        &input.message_id,
        input.before_message,
    )?;
    conversation.id = crate::storage::new_id("ai-conversation");
    conversation.title = truncate_characters(
        &format!("{} · 分支", conversation.title),
        MAX_CONVERSATION_TITLE_LENGTH,
    );
    conversation.created_at = now_timestamp();
    conversation.updated_at = conversation.created_at.clone();
    conversation.provider_reasoning.clear();
    conversation.task = None;
    conversation.context_budget = None;
    conversation.resume_context = None;
    for message in &mut conversation.messages {
        for attachment in &mut message.attachments {
            attachment.content = Some(load_ai_attachment(app, &source_id, attachment)?);
            attachment.id = crate::storage::new_id("ai-attachment");
        }
    }
    ensure_conversation_fits(&conversation)?;
    for message in &conversation.messages {
        save_ai_attachments(app, &conversation.id, &message.attachments)?;
    }
    persist_conversation(app, &mut index, &conversation)?;
    Ok(public_conversation(conversation))
}

fn attachment_upload_from_stored(
    app: &AppHandle,
    owner: &str,
    attachment: &AiAttachment,
) -> Result<AiAttachmentUpload, AppError> {
    let content = load_ai_attachment(app, owner, attachment)?;
    Ok(AiAttachmentUpload {
        name: attachment.name.clone(),
        data: if attachment.kind == "text" {
            base64::engine::general_purpose::STANDARD.encode(content.as_bytes())
        } else {
            content
        },
    })
}

pub fn get_message_attachments(
    app: &AppHandle,
    conversation_id: &str,
    message_id: &str,
) -> Result<Vec<AiAttachmentUpload>, AppError> {
    let id = validate_conversation_id(conversation_id)?;
    let _guard = conversation_store_lock()?;
    require_indexed_conversation(&read_conversation_index(app)?, &id)?;
    let conversation = read_stored_conversation(app, &id)?;
    let message = conversation
        .messages
        .iter()
        .find(|message| message.id == message_id)
        .ok_or_else(|| attachment_error("找不到附件所属消息"))?;
    message
        .attachments
        .iter()
        .map(|attachment| attachment_upload_from_stored(app, &id, attachment))
        .collect()
}

#[cfg(test)]
mod conversation_actions_tests {
    use super::*;
    #[test]
    fn branch_excludes_edited_turn_and_strips_execution_history() {
        let target = json!({"tabId":"tab","rootTabId":"root","sessionType":"ssh","sessionRevision":"old","displayHost":"host","connected":true});
        let message: AiMessage = serde_json::from_value(json!({
            "id":"one","role":"user","content":"original","createdAt":"0",
            "attachments":[{"id":"ai-attachment-one","name":"note.txt","mime":"text/plain","kind":"text","size":4}],
            "context":{"mode":"L2","target":target,"redactions":[],"truncated":false},
            "toolActivities":[{"proposal":{"id":"old-approval","toolName":"transterm_run_readonly_command","command":"pwd","risk":"read-only","target":target,"approvalRequestId":"already-approved"}}]
        })).unwrap();
        let mut second = message.clone();
        second.id = "two".into();
        second.content = "needle正文".into();
        let original = vec![message, second];
        let fork = fork_message_history(&original, "two", true).unwrap();
        assert_eq!(fork.len(), 1);
        assert_eq!(fork[0].content, "original");
        assert_ne!(fork[0].id, "one");
        assert!(fork[0].context.is_none());
        assert!(fork[0].tool_activities.is_empty());
        assert_eq!(fork[0].attachments[0].name, "note.txt");
        assert!(original[0].context.is_some());
        assert_eq!(original[0].tool_activities.len(), 1);
    }
    #[test]
    fn search_matches_body_and_unicode_without_tool_execution() {
        let message: AiMessage = serde_json::from_value(json!({"id":"one","role":"assistant","content":"Heading\n故障：CONNECTION RESET","createdAt":"0"})).unwrap();
        assert_eq!(
            conversation_match_snippet(&[message], "connection reset").as_deref(),
            Some("故障：CONNECTION RESET")
        );
    }
}
