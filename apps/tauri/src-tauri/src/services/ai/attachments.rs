// Explicit chat uploads are stored separately from the bounded conversation JSON.
use base64::Engine;

const MAX_AI_ATTACHMENT_BYTES: usize = 5 * 1024 * 1024;
const MAX_AI_ATTACHMENT_TURN_BYTES: usize = 20 * 1024 * 1024;
const MAX_AI_ATTACHMENT_TEXT_BYTES: usize = 128 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAttachment {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub kind: String,
    pub size: usize,
    #[serde(skip)]
    content: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AiAttachmentUpload {
    pub name: String,
    pub data: String,
}

pub fn read_ai_attachment_files(paths: Vec<String>) -> Result<Vec<AiAttachmentUpload>, AppError> {
    use std::io::Read;
    if paths.is_empty() || paths.len() > 8 {
        return Err(attachment_error("每次请选择 1–8 个附件"));
    }
    let mut total = 0usize;
    let mut uploads = Vec::new();
    for path in paths {
        let path = Path::new(&path);
        if !path.is_absolute() {
            return Err(attachment_error("请选择有效的本地文件"));
        }
        let file = fs::File::open(path).map_err(|_| attachment_error("无法读取附件文件"))?;
        let metadata = file
            .metadata()
            .map_err(|_| attachment_error("无法读取附件信息"))?;
        if !metadata.is_file() || metadata.len() > MAX_AI_ATTACHMENT_BYTES as u64 {
            return Err(attachment_error("请选择 5 MB 以内的文件"));
        }
        let mut bytes = Vec::new();
        file.take((MAX_AI_ATTACHMENT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| attachment_error("无法读取附件内容"))?;
        total = total.saturating_add(bytes.len());
        if total > MAX_AI_ATTACHMENT_TURN_BYTES {
            return Err(attachment_error("附件合计最多 20 MB"));
        }
        let upload = AiAttachmentUpload {
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| attachment_error("附件文件名无效"))?
                .to_string(),
            data: base64::engine::general_purpose::STANDARD.encode(bytes),
        };
        decode_ai_upload(&upload)?;
        uploads.push(upload);
    }
    Ok(uploads)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredAiAttachment {
    conversation_id: String,
    attachment: AiAttachment,
    content: String,
}

fn attachment_error(message: &str) -> AppError {
    ai_error("AI_ATTACHMENT_INVALID", message)
}

fn attachment_path(app: &AppHandle, id: &str) -> Result<std::path::PathBuf, AppError> {
    let id = validate_message_id(id)?;
    if !id.starts_with("ai-attachment-") {
        return Err(attachment_error("附件 ID 无效"));
    }
    Ok(workspace_file(app, "ai-attachments")?.join(format!("{id}.json")))
}

fn decode_ai_upload(upload: &AiAttachmentUpload) -> Result<AiAttachment, AppError> {
    let name = upload.name.trim();
    if name.is_empty()
        || name.chars().count() > 240
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control)
    {
        return Err(attachment_error("附件文件名无效"));
    }
    if upload.data.len() > MAX_AI_ATTACHMENT_BYTES.div_ceil(3) * 4 {
        return Err(attachment_error("单个附件最多 5 MB"));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&upload.data)
        .map_err(|_| attachment_error("附件内容编码无效"))?;
    if bytes.is_empty() || bytes.len() > MAX_AI_ATTACHMENT_BYTES {
        return Err(attachment_error("附件为空或超过 5 MB"));
    }
    let extension = name
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let (kind, mime, content) = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        ("image", "image/png", upload.data.clone())
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        ("image", "image/jpeg", upload.data.clone())
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        ("image", "image/gif", upload.data.clone())
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        ("image", "image/webp", upload.data.clone())
    } else if bytes.starts_with(b"%PDF-") {
        ("pdf", "application/pdf", upload.data.clone())
    } else {
        if matches!(
            extension.as_str(),
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "pdf"
        ) {
            return Err(attachment_error("图片或 PDF 格式与内容不符"));
        }
        if bytes.len() > MAX_AI_ATTACHMENT_TEXT_BYTES {
            return Err(attachment_error("文本/代码附件最多 128 KB，请选择所需片段"));
        }
        let text = std::str::from_utf8(&bytes)
            .map_err(|_| attachment_error("暂不支持此文件，请使用 UTF-8 文本、图片或 PDF"))?;
        if text
            .chars()
            .any(|c| c == '\0' || (c.is_control() && !matches!(c, '\n' | '\r' | '\t' | '\u{feff}')))
        {
            return Err(attachment_error(
                "附件包含二进制内容，请使用文本、图片或 PDF",
            ));
        }
        ("text", "text/plain", text.to_string())
    };
    Ok(AiAttachment {
        id: crate::storage::new_id("ai-attachment"),
        name: name.to_string(),
        mime: mime.to_string(),
        kind: kind.to_string(),
        size: bytes.len(),
        content: Some(content),
    })
}

fn prepare_ai_uploads(uploads: &[AiAttachmentUpload]) -> Result<Vec<AiAttachment>, AppError> {
    if uploads.len() > 8 {
        return Err(attachment_error("每条消息最多添加 8 个附件"));
    }
    let attachments = uploads
        .iter()
        .map(decode_ai_upload)
        .collect::<Result<Vec<_>, _>>()?;
    if attachments.iter().map(|a| a.size).sum::<usize>() > MAX_AI_ATTACHMENT_TURN_BYTES {
        return Err(attachment_error("每条消息的附件合计最多 20 MB"));
    }
    Ok(attachments)
}

fn save_ai_attachments(
    app: &AppHandle,
    conversation_id: &str,
    attachments: &[AiAttachment],
) -> Result<(), AppError> {
    if attachments.is_empty() {
        return Ok(());
    }
    let directory = workspace_file(app, "ai-attachments")?;
    fs::create_dir_all(&directory).map_err(|error| AppError::Storage(error.to_string()))?;
    for attachment in attachments {
        let file = StoredAiAttachment {
            conversation_id: conversation_id.to_string(),
            attachment: attachment.clone(),
            content: attachment
                .content
                .clone()
                .ok_or_else(|| attachment_error("附件内容未就绪"))?,
        };
        write_json_file(&attachment_path(app, &attachment.id)?, &file)?;
    }
    Ok(())
}

fn load_ai_attachment(
    app: &AppHandle,
    conversation_id: &str,
    attachment: &AiAttachment,
) -> Result<String, AppError> {
    let path = attachment_path(app, &attachment.id)?;
    let metadata = fs::metadata(&path).map_err(|_| attachment_error("附件已不可用，请重新添加"))?;
    if metadata.len() > (MAX_AI_ATTACHMENT_BYTES * 2) as u64 {
        return Err(attachment_error("附件存储超过大小限制"));
    }
    let file: StoredAiAttachment = serde_json::from_slice(
        &fs::read(path).map_err(|error| AppError::Storage(error.to_string()))?,
    )
    .map_err(|_| attachment_error("附件存储已损坏"))?;
    if file.conversation_id != conversation_id
        || file.attachment.name != attachment.name
        || file.attachment.kind != attachment.kind
        || file.attachment.mime != attachment.mime
        || file.attachment.size != attachment.size
    {
        return Err(attachment_error("附件不属于当前对话"));
    }
    Ok(file.content)
}

fn hydrate_ai_attachments(
    app: &AppHandle,
    conversation: &mut StoredConversation,
) -> Result<(), AppError> {
    // Only hydrate the same messages selected for the provider, with a bounded total.
    let selected = selected_history_messages(conversation)
        .iter()
        .map(|message| message.id.clone())
        .collect::<Vec<_>>();
    let mut bytes = 0usize;
    for message in conversation
        .messages
        .iter_mut()
        .rev()
        .filter(|message| selected.contains(&message.id))
    {
        for attachment in &mut message.attachments {
            bytes = bytes.saturating_add(attachment.size);
            if bytes <= MAX_AI_ATTACHMENT_TURN_BYTES {
                attachment.content = Some(load_ai_attachment(app, &conversation.id, attachment)?);
            }
        }
    }
    Ok(())
}

pub fn get_ai_attachment_preview(
    app: &AppHandle,
    conversation_id: &str,
    attachment_id: &str,
) -> Result<String, AppError> {
    let conversation_id = validate_conversation_id(conversation_id)?;
    let _guard = conversation_store_lock()?;
    let conversation = read_stored_conversation(app, &conversation_id)?;
    let attachment = conversation
        .messages
        .iter()
        .flat_map(|message| &message.attachments)
        .find(|attachment| attachment.id == attachment_id)
        .ok_or_else(|| attachment_error("附件不属于当前对话"))?;
    let content = load_ai_attachment(app, &conversation_id, attachment)?;
    if attachment.kind == "image" {
        Ok(format!("data:{};base64,{content}", attachment.mime))
    } else if attachment.kind == "text" {
        Ok(content)
    } else {
        Err(attachment_error(
            "PDF 已作为文件发送给模型，暂不提供内嵌预览",
        ))
    }
}

fn remove_ai_attachment_files(app: &AppHandle, attachments: &[AiAttachment]) {
    for attachment in attachments {
        if let Ok(path) = attachment_path(app, &attachment.id) {
            let _ = fs::remove_file(path);
        }
    }
}
