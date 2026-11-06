/// Only connection identity enters this hash, never credentials or display preferences.
fn monitoring_target_key(profile: &Value, host: &str, port: u16, username: &str) -> Option<String> {
    use sha2::{Digest, Sha256};

    let id = profile
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())?;
    let proxy = profile.get("proxy");
    let identity = serde_json::json!([
        id,
        host,
        port,
        username,
        profile.get("jumpProfileId"),
        profile.get("jumpProfileIds"),
        proxy.and_then(|p| p.get("type")),
        proxy.and_then(|p| p.get("host")),
        proxy.and_then(|p| p.get("port")),
        proxy.and_then(|p| p.get("username")),
    ]);
    Some(format!(
        "{:x}",
        Sha256::digest(identity.to_string().as_bytes())
    ))
}

#[cfg(test)]
mod monitoring_target_tests {
    use super::*;

    #[test]
    fn target_edits_are_isolated_but_renames_and_passwords_do_not_split_collectors() {
        let mut profile = serde_json::json!({"id": "profile", "name": "Before", "password": "old"});
        let original = monitoring_target_key(&profile, "host-a", 22, "alice");
        assert_ne!(
            original,
            monitoring_target_key(&profile, "host-b", 22, "alice")
        );
        assert_ne!(
            original,
            monitoring_target_key(&profile, "host-a", 2222, "alice")
        );
        assert_ne!(
            original,
            monitoring_target_key(&profile, "host-a", 22, "bob")
        );
        profile["name"] = "After".into();
        profile["password"] = "new".into();
        assert_eq!(
            original,
            monitoring_target_key(&profile, "host-a", 22, "alice")
        );
        profile["proxy"] = serde_json::json!({"type": "socks5", "host": "proxy", "port": 1080});
        assert_ne!(
            original,
            monitoring_target_key(&profile, "host-a", 22, "alice")
        );
    }
}
