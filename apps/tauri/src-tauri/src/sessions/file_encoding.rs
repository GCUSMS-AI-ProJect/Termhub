// The legacy local editor codec replaces invalid input silently. Versioned edits
// must fail before making a backup or changing a file if a codec would lose data.
fn text_codec(label: Option<&str>) -> Result<&'static encoding_rs::Encoding, String> {
    let label = label.unwrap_or("utf-8").trim();
    let label = match label {
        "utf-8-bom" => "utf-8",
        "utf16" | "utf16le" => "utf-16le",
        "utf16be" => "utf-16be",
        _ => label,
    };
    encoding_rs::Encoding::for_label(label.as_bytes())
        .ok_or_else(|| "FILE_ENCODING_INVALID: Unsupported text encoding".to_string())
}

pub(crate) fn decode_local_text(bytes: &[u8], label: Option<&str>) -> Result<String, String> {
    let codec = text_codec(label)?;
    // Keep BOM characters in the buffer so ordinary edits and undo preserve
    // them. Do not sniff another encoding and then accidentally save as UTF-8.
    codec
        .decode_without_bom_handling_and_without_replacement(bytes)
        .map(|text| text.into_owned())
        .ok_or_else(|| {
            "FILE_ENCODING_INVALID: Select the file's encoding before editing".to_string()
        })
}

pub(crate) fn encode_local_text(content: &str, label: Option<&str>) -> Result<Vec<u8>, String> {
    let codec = text_codec(label)?;
    if codec == encoding_rs::UTF_16LE || codec == encoding_rs::UTF_16BE {
        return Ok(content
            .encode_utf16()
            .flat_map(|unit| {
                if codec == encoding_rs::UTF_16LE {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                }
            })
            .collect());
    }
    let (bytes, _, had_errors) = codec.encode(content);
    if had_errors {
        return Err("FILE_ENCODING_INVALID: Encoding cannot represent the edited text".to_string());
    }
    let mut bytes = bytes.into_owned();
    if label == Some("utf-8-bom") && !bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        bytes.splice(0..0, [0xef, 0xbb, 0xbf]);
    }
    Ok(bytes)
}
