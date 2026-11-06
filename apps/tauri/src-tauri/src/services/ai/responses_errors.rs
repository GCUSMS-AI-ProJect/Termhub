// Responses can fail inside HTTP 200 SSE or JSON responses.
fn responses_provider_error(response: &Value, fallback_status: &str) -> Option<AppError> {
    let status = if matches!(fallback_status, "failed" | "incomplete") {
        fallback_status
    } else {
        response.get("status").and_then(Value::as_str).unwrap_or("")
    };
    let error = response.get("error").filter(|error| !error.is_null());
    if status != "failed" && status != "incomplete" && error.is_none() {
        return None;
    }
    let reason = response
        .get("incomplete_details")
        .and_then(|details| details.get("reason"))
        .and_then(Value::as_str);
    let code = error
        .and_then(|error| error.get("code"))
        .and_then(Value::as_str)
        .or(reason);
    let explanation = match code {
        Some("invalid_function_parameters") => "工具参数定义不符合接口要求",
        Some("max_output_tokens") => "已达到输出额度上限，请提高服务端输出额度或缩短请求后重试",
        Some("content_filter") => "回答被服务端内容过滤中止，请调整请求后重试",
        _ if status == "incomplete" => "回答未完成，请重试",
        _ => "请求失败",
    };
    let detail = error
        .and_then(|error| error.get("message").and_then(Value::as_str))
        .map(sanitize_provider_error_detail)
        .filter(|message| !message.is_empty());
    let code = code
        .filter(|code| {
            code.len() <= 80
                && code
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        })
        .map(|code| format!(" ({code})"))
        .unwrap_or_default();
    let detail = detail
        .map(|detail| format!("：{detail}"))
        .unwrap_or_default();
    Some(ai_error(
        "AI_PROVIDER_RESPONSE_INVALID",
        format!("OpenAI Responses Provider {explanation}{code}{detail}"),
    ))
}

fn sanitize_provider_error_detail(value: &str) -> String {
    static API_KEY_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)\bsk-[a-z0-9_-]+")
            .expect("constant provider key redaction regex must compile")
    });
    let redacted = API_KEY_RE.replace_all(value, "[REDACTED]");
    let message = sanitize_review_error(&redacted);
    truncate_characters(&message, 512)
}
