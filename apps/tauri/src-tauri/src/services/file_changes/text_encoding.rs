fn decode_local_text(bytes: &[u8], label: Option<&str>) -> Result<String, AppError> {
    crate::sessions::file_encoding::decode_local_text(bytes, label).map_err(error)
}

fn encode_local_text(content: &str, label: Option<&str>) -> Result<Vec<u8>, AppError> {
    crate::sessions::file_encoding::encode_local_text(content, label).map_err(error)
}
