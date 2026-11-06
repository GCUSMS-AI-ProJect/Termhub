use super::ReaClient;
use serde::Serialize;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaEngineStatus {
    pub id: String,
    pub name: String,
    pub status: String,
    pub detail: String,
}

fn unknown_engines(detail: &str) -> Vec<ReaEngineStatus> {
    [
        ("ghidra", "Ghidra"),
        ("ida", "IDA"),
        ("jadx", "JADX"),
        ("browser", "Browser"),
    ]
    .into_iter()
    .map(|(id, name)| ReaEngineStatus {
        id: id.into(),
        name: name.into(),
        status: "unknown".into(),
        detail: detail.into(),
    })
    .collect()
}

fn session_payload(result: &Value) -> Option<Value> {
    if result["isError"] == true {
        return None;
    }
    if let Some(data) = result.get("structuredContent") {
        let data = data.get("result").unwrap_or(data);
        if data.get("analysis_provider_candidates").is_some() {
            return Some(data.clone());
        }
    }
    result["content"]
        .as_array()?
        .iter()
        .filter_map(|part| serde_json::from_str::<Value>(part["text"].as_str()?).ok())
        .map(|value| value.get("result").cloned().unwrap_or(value))
        .find(|value| value.get("analysis_provider_candidates").is_some())
}

fn project_engines(result: &Value) -> Vec<ReaEngineStatus> {
    let mut engines = unknown_engines("REA did not report this engine's runtime availability.");
    engines[3].detail = "Browser analysis requires a selected browser executable or an available CDP endpoint. Tool discovery alone cannot verify it.".into();
    let Some(session) = session_payload(result) else {
        return engines;
    };
    let Some(candidates) = session["analysis_provider_candidates"].as_array() else {
        return engines;
    };
    for engine in &mut engines {
        let candidate = candidates.iter().find(|candidate| {
            // Match an explicit provider identity, never a tool name/count.
            let id = candidate["provider"]["id"]
                .as_str()
                .unwrap_or_default()
                .to_ascii_lowercase();
            id.split(['-', '_', '.', '/']).any(|part| part == engine.id)
        });
        if let Some(candidate) = candidate {
            let availability = &candidate["availability"];
            engine.status = match availability["status"].as_str() {
                Some("available") => "available",
                Some("unavailable") => "unavailable",
                _ => "unknown",
            }
            .into();
            engine.detail = availability["reason"]
                .as_str()
                .unwrap_or("REA provider availability check")
                .chars()
                .take(500)
                .collect();
        }
    }
    // JADX is an Android auxiliary provider, not a native candidate. REA's
    // binary_session computes this group after inspectJadxAvailability.
    if let Some(groups) = session
        .pointer("/tool_availability/groups")
        .and_then(Value::as_array)
    {
        if let Some(android) = groups
            .iter()
            .find(|group| group["surface"] == "android-provider")
        {
            engines[2].status = if android["available"] == true {
                "available"
            } else {
                "unavailable"
            }
            .into();
            engines[2].detail = android["remediation"]
                .as_str()
                .unwrap_or("REA verified the configured JADX runtime.")
                .chars()
                .take(500)
                .collect();
        }
        if let Some(browser) = groups.iter().find(|group| {
            group["names"]
                .as_array()
                .is_some_and(|names| names.iter().any(|name| name == "list_browser_targets"))
        }) {
            // Enabled browser tools still require a selected executable/CDP
            // endpoint. Do not confuse a registered provider with a browser.
            if browser["available"] == false {
                engines[3].status = "unavailable".into();
                engines[3].detail = browser["remediation"]
                    .as_str()
                    .unwrap_or("REA browser provider is unavailable.")
                    .chars()
                    .take(500)
                    .collect();
            }
        }
    }
    engines
}

pub async fn check_engines(
    client: &mut ReaClient,
    cancellation: &CancellationToken,
) -> Vec<ReaEngineStatus> {
    if !client
        .tools
        .iter()
        .any(|tool| tool["name"] == "binary_session")
    {
        return unknown_engines("REA does not expose a read-only engine status check.");
    }
    // binary_session reports runtime availability without opening a target,
    // launching analysis, installing engines or contacting a model provider.
    match tokio::time::timeout(
        std::time::Duration::from_secs(25),
        client.request(
            "tools/call",
            json!({"name":"binary_session", "arguments":{}}),
            cancellation,
        ),
    )
    .await
    {
        Ok(Ok(result)) => project_engines(&result),
        _ => unknown_engines("Engine verification did not complete. REA remains connected."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn engine_status_requires_runtime_evidence_not_discovered_tools() {
        let result = json!({"structuredContent":{"result":{"analysis_provider_candidates":[
            {"provider":{"id":"ghidra"},"availability":{"status":"unavailable","reason":"GHIDRA_INSTALL_DIR not configured"}},
            {"provider":{"id":"ida-pro"},"availability":{"status":"available"}}
        ]}}});
        let engines = project_engines(&result);
        assert_eq!(engines[0].status, "unavailable");
        assert_eq!(engines[1].status, "available");
        assert_eq!(engines[2].status, "unknown");
        assert_eq!(engines[3].status, "unknown");
        assert!(
            project_engines(&json!({"tools":[{"name":"browser_launch"}]}))
                .iter()
                .all(|engine| engine.status == "unknown")
        );
    }
    #[test]
    fn engine_status_accepts_mcp_text_and_rejects_error_envelope() {
        let data = json!({"analysis_provider_candidates":[{"provider":{"id":"jadx"},"availability":{"status":"available"}}]});
        assert_eq!(
            project_engines(&json!({"content":[{"type":"text","text":data.to_string()}]}))[2]
                .status,
            "available"
        );
        assert!(
            project_engines(&json!({"isError":true,"structuredContent":data}))
                .iter()
                .all(|engine| engine.status == "unknown")
        );
    }

    #[test]
    fn engine_status_uses_jadx_runtime_check_without_claiming_browser_ready() {
        let data = json!({"structuredContent":{"result":{
            "analysis_provider_candidates":[],
            "tool_availability":{"groups":[
                {"surface":"android-provider","available":true,"names":["analyze_android_apk"]},
                {"surface":"browser-provider","available":true,"names":["list_browser_targets"]}
            ]}
        }}});
        let engines = project_engines(&data);
        assert_eq!(engines[2].status, "available");
        assert_eq!(engines[3].status, "unknown");
    }
}
