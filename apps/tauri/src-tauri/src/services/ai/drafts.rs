// Draft text and attachment references are stored separately from chat history.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatDraft {
    scope: String,
    text: String,
    #[serde(default)]
    attachments: Vec<AiAttachmentUpload>,
    conversation_id: Option<String>,
    workspace_id: Option<String>,
    provider_id: Option<String>,
    model: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct StoredAiDraft {
    draft: AiChatDraft,
    attachments: Vec<AiAttachment>,
}

fn stored_ai_draft(mut draft: AiChatDraft, attachments: Vec<AiAttachment>) -> StoredAiDraft {
    draft.attachments.clear();
    StoredAiDraft { draft, attachments }
}

fn ai_draft_path(app: &AppHandle, scope: &str) -> Result<std::path::PathBuf, AppError> {
    if scope.is_empty()
        || scope.len() > 160
        || !scope
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(ai_error("AI_CONVERSATION_INVALID_INPUT", "草稿标识无效"));
    }
    Ok(workspace_file(app, "ai-drafts")?.join(format!("{scope}.json")))
}

fn read_stored_ai_draft(path: &Path) -> Result<Option<StoredAiDraft>, AppError> {
    if !path.exists() {
        return Ok(None);
    }
    if fs::metadata(path)
        .map_err(|error| AppError::Storage(error.to_string()))?
        .len()
        > 1024 * 1024
    {
        return Err(attachment_error("草稿大小超出限制"));
    }
    let bytes = fs::read(path).map_err(|error| AppError::Storage(error.to_string()))?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| AppError::Serialization(error.to_string()))
}

pub fn get_chat_draft(app: &AppHandle, scope: &str) -> Result<Option<AiChatDraft>, AppError> {
    let _guard = conversation_store_lock()?;
    let Some(mut stored) = read_stored_ai_draft(&ai_draft_path(app, scope)?)? else {
        return Ok(None);
    };
    stored.draft.attachments = stored
        .attachments
        .iter()
        .map(|attachment| attachment_upload_from_stored(app, scope, attachment))
        .collect::<Result<_, _>>()?;
    Ok(Some(stored.draft))
}

pub fn save_chat_draft(app: &AppHandle, draft: AiChatDraft) -> Result<(), AppError> {
    let _guard = conversation_store_lock()?;
    let path = ai_draft_path(app, &draft.scope)?;
    if let Some(id) = &draft.conversation_id {
        require_indexed_conversation(&read_conversation_index(app)?, id)?;
        if draft.scope != format!("conversation-{id}") {
            return Err(attachment_error("草稿与对话不匹配"));
        }
    }
    if draft.text.chars().count() > MAX_USER_MESSAGE_LENGTH {
        return Err(ai_error(
            "AI_CONVERSATION_INVALID_INPUT",
            "草稿超过长度限制",
        ));
    }
    let previous = read_stored_ai_draft(&path)?;
    let mut attachments = prepare_ai_uploads(&draft.attachments)?;
    for attachment in &mut attachments {
        if let Some(previous) = &previous {
            for saved in &previous.attachments {
                if saved.name == attachment.name
                    && saved.kind == attachment.kind
                    && saved.size == attachment.size
                    && load_ai_attachment(app, &draft.scope, saved).ok().as_ref()
                        == attachment.content.as_ref()
                {
                    attachment.id.clone_from(&saved.id);
                    break;
                }
            }
        }
    }
    let new_attachments = attachments
        .iter()
        .filter(|attachment| {
            !previous.as_ref().is_some_and(|old| {
                old.attachments
                    .iter()
                    .any(|saved| saved.id == attachment.id)
            })
        })
        .cloned()
        .collect::<Vec<_>>();
    if let Some(directory) = path.parent() {
        fs::create_dir_all(directory).map_err(|error| AppError::Storage(error.to_string()))?;
    }
    if let Err(error) = save_ai_attachments(app, &draft.scope, &new_attachments) {
        remove_ai_attachment_files(app, &new_attachments);
        return Err(error);
    }
    let stored = stored_ai_draft(draft, attachments);
    if let Err(error) = write_json_file(&path, &stored) {
        remove_ai_attachment_files(app, &new_attachments);
        return Err(error);
    }
    if let Some(previous) = previous {
        for attachment in previous.attachments {
            if stored
                .attachments
                .iter()
                .any(|saved| saved.id == attachment.id)
            {
                continue;
            }
            if let Ok(path) = attachment_path(app, &attachment.id) {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}

fn remove_conversation_draft(app: &AppHandle, conversation_id: &str) {
    if let Ok(path) = ai_draft_path(app, &format!("conversation-{conversation_id}")) {
        if let Ok(Some(draft)) = read_stored_ai_draft(&path) {
            remove_ai_attachment_files(app, &draft.attachments);
        }
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod draft_tests {
    use super::*;

    #[test]
    fn draft_metadata_retains_references_without_attachment_payload() {
        let draft: AiChatDraft = serde_json::from_value(json!({"scope":"new","text":"draft text","attachments":[{"name":"note.txt","data":"c2VjcmV0"}]})).unwrap();
        let attachments = prepare_ai_uploads(&draft.attachments).unwrap();
        let id = attachments[0].id.clone();
        let serialized = serde_json::to_string(&stored_ai_draft(draft, attachments)).unwrap();
        assert!(serialized.contains(&id));
        assert!(serialized.contains("draft text"));
        assert!(!serialized.contains("c2VjcmV0"));
        assert!(!serialized.contains("secret"));
        let restored: StoredAiDraft = serde_json::from_str(&serialized).unwrap();
        assert!(restored.draft.attachments.is_empty());
        assert_eq!(restored.attachments[0].name, "note.txt");
    }
}
