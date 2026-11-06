use super::*;

fn snapshot(content: &str) -> VersionedFile {
    VersionedFile {
        target: FileTarget {
            source: "remote".into(),
            path: "/etc/example.conf".into(),
            tab_id: Some("tab".into()),
            encoding: None,
        },
        content: content.into(),
        revision: digest(content),
        binding: "session-1".into(),
    }
}

#[test]
fn external_changes_and_replaced_sessions_are_not_overwritten() {
    let opened = snapshot("old value");
    assert!(compare_version(
        &snapshot("new external value"),
        &opened.revision,
        &opened.binding
    )
    .unwrap_err()
    .to_string()
    .contains("FILE_CONFLICT"));
    assert!(compare_version(&opened, &opened.revision, "session-2")
        .unwrap_err()
        .to_string()
        .contains("FILE_TARGET_CHANGED"));
    assert!(compare_version(&opened, &opened.revision, &opened.binding).is_ok());
}

#[test]
fn text_revision_preserves_line_endings_and_unicode() {
    assert_ne!(digest("中文\r\n"), digest("中文\n"));
    assert_ne!(digest("中文\n"), digest("中文 "));
}

#[test]
fn unknown_sources_and_relative_paths_cannot_be_saved() {
    let mut target = snapshot("").target;
    target.source = "shell".into();
    assert!(validate_target(&target).is_err());
    target.source = "remote".into();
    target.path = "../other".into();
    assert!(validate_target(&target).is_err());
    target.path = "/etc/config".into();
    target.tab_id = None;
    assert!(validate_target(&target).is_err());
}

#[test]
fn local_edits_reject_invalid_bytes_and_unrepresentable_characters() {
    assert!(decode_local_text(b"valid\xff", Some("utf-8")).is_err());
    assert!(decode_local_text(&[0xff, 0xfe, 0x41], Some("utf-16le")).is_err());
    assert!(encode_local_text("中文", Some("windows-1252")).is_err());
    assert!(decode_local_text(b"abc", Some("unknown-codec")).is_err());
}

#[test]
fn local_edits_preserve_bom_line_endings_and_utf16_byte_order() {
    for label in ["utf-8", "utf-8-bom", "utf-16le", "utf-16be"] {
        let text = "\u{feff}中文\r\n";
        let encoded = encode_local_text(text, Some(label)).unwrap();
        let decoded = decode_local_text(&encoded, Some(label)).unwrap();
        assert_eq!(decoded, text, "{label}");
        assert_eq!(encode_local_text(&decoded, Some(label)).unwrap(), encoded);
    }
    let raw = [0x41, 0x00, 0x42, 0x00];
    let decoded = decode_local_text(&raw, Some("utf-16le")).unwrap();
    assert_eq!(encode_local_text(&decoded, Some("utf-16le")).unwrap(), raw);
}
