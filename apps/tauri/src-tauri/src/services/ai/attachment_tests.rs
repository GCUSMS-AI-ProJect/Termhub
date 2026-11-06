#[cfg(test)]
mod attachment_tests {
    use super::*;

    fn upload(name: &str, data: &[u8]) -> AiAttachmentUpload {
        AiAttachmentUpload {
            name: name.into(),
            data: base64::engine::general_purpose::STANDARD.encode(data),
        }
    }

    fn conversation(attachments: Vec<AiAttachment>) -> StoredConversation {
        StoredConversation {
            schema_version: CONVERSATION_SCHEMA_VERSION,
            id: "ai-conversation-test".into(),
            title: "Test".into(),
            provider_id: "provider".into(),
            created_at: "1".into(),
            updated_at: "1".into(),
            workspace_id: None,
            workspace: None,
            provider_reasoning: BTreeMap::new(),
            task: None,
            context_budget: None,
            resume_context: None,
            messages: vec![AiMessage {
                id: "ai-message-test".into(),
                role: AiMessageRole::User,
                content: "Analyze".into(),
                created_at: "1".into(),
                context: None,
                tool_activities: vec![],
                attachments,
            }],
        }
    }

    #[test]
    fn uploads_reject_paths_binary_invalid_encoding_and_excessive_sizes() {
        for (name, data) in [
            ("../secret.txt", b"text".as_slice()),
            ("bad.pdf", b"text"),
            ("binary.bin", b"x\0y"),
            ("bad.txt", b"\xff"),
        ] {
            assert!(decode_ai_upload(&upload(name, data)).is_err(), "{name}");
        }
        assert!(decode_ai_upload(&AiAttachmentUpload {
            name: "x.txt".into(),
            data: "%%%".into()
        })
        .is_err());
        assert!(decode_ai_upload(&upload("empty.txt", b"")).is_err());
        assert!(decode_ai_upload(&upload(
            "large.txt",
            &vec![b'a'; MAX_AI_ATTACHMENT_TEXT_BYTES + 1]
        ))
        .is_err());
        let uploads = (0..9)
            .map(|_| upload("x.txt", b"hello"))
            .collect::<Vec<_>>();
        assert!(prepare_ai_uploads(&uploads).is_err());
    }

    #[test]
    fn attachment_metadata_never_serializes_file_contents() {
        let attachment =
            decode_ai_upload(&upload("sample.ts", "const 你好 = 1;".as_bytes())).unwrap();
        assert_eq!(attachment.kind, "text");
        let value = serde_json::to_value(&attachment).unwrap();
        assert_eq!(value["name"], "sample.ts");
        assert!(value.get("content").is_none());
        assert!(!value.to_string().contains("const"));
        let restored: AiAttachment = serde_json::from_value(value).unwrap();
        assert!(restored.content.is_none());
    }

    #[test]
    fn provider_payloads_preserve_actual_text_image_and_pdf_content() {
        let text = decode_ai_upload(&upload("source.py", b"print('attachment-evidence')")).unwrap();
        let image = decode_ai_upload(&upload("photo.png", b"\x89PNG\r\n\x1a\nfixture")).unwrap();
        let pdf = decode_ai_upload(&upload("document.pdf", b"%PDF-1.4 fixture")).unwrap();
        let chat = conversation(vec![text, image.clone(), pdf.clone()]);
        for (protocol, image_type, pdf_type) in [
            ("responses", "input_image", "input_file"),
            ("chat", "image_url", "file"),
            ("anthropic", "image", "document"),
        ] {
            let payload = provider_message_values(&chat, protocol);
            assert!(payload[0]["content"][0]["text"]
                .as_str()
                .unwrap()
                .contains("attachment-evidence"));
            assert_eq!(payload[0]["content"][1]["type"], image_type);
            assert_eq!(payload[0]["content"][2]["type"], pdf_type);
        }
        let response_pdf = attachment_content_block(&pdf, "responses").unwrap();
        assert_eq!(response_pdf["filename"], "document.pdf");
        assert!(response_pdf["file_data"]
            .as_str()
            .unwrap()
            .starts_with("data:application/pdf;base64,"));
        let anthropic_image = attachment_content_block(&image, "anthropic").unwrap();
        assert_eq!(anthropic_image["source"]["data"], image.content.unwrap());
    }

    #[test]
    fn workspace_context_is_explicit_and_plain_history_stays_compatible() {
        let mut chat = conversation(vec![]);
        assert_eq!(
            provider_message_values(&chat, "responses")[0]["content"],
            "Analyze"
        );
        chat.workspace = Some(AiWorkspace {
            id: "workspace".into(),
            name: "Project".into(),
            kind: "ssh".into(),
            path: "/srv/project".into(),
            profile_id: Some("profile".into()),
            host: Some("host".into()),
            created_at: "1".into(),
        });
        let payload = provider_message_values(&chat, "responses");
        let context = payload[0]["content"][1]["text"].as_str().unwrap();
        assert!(context.contains("/srv/project"));
        assert!(context.contains("does not itself grant command access"));
        assert!(title_summary_history_items(&chat)
            .iter()
            .all(|(_, text)| !text.contains("/srv/project")));
    }
}
