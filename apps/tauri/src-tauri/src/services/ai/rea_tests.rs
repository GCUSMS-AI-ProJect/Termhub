#[cfg(test)]
mod rea_tests {
    use super::*;

    fn activation_target() -> AiContextTarget {
        AiContextTarget {
            tab_id: "rea-tab".into(),
            root_tab_id: "rea-tab".into(),
            session_type: "ssh".into(),
            session_revision: "1".into(),
            display_host: "test-host".into(),
            user: Some("test".into()),
            cwd: Some("/tmp".into()),
            connected: true,
            network_device: false,
        }
    }

    fn activation_status() -> crate::services::rea::ReaStatus {
        crate::services::rea::ReaStatus {
            ready: true,
            version: "6.7.0".into(),
            target: "rea-tab".into(),
            tool_count: 207,
            server: json!({"name":"fixture"}),
            message: "ready".into(),
            engines: Vec::new(),
        }
    }

    #[test]
    fn manual_rea_is_off_by_default_scoped_and_cancels_on_disable() {
        let mut registry = ReaActivationRegistry::default();
        let target = activation_target();
        assert!(registry.entry("window-a", &target).is_none());
        registry.enable("window-a", target.clone(), activation_status());
        let token = registry
            .entry("window-a", &target)
            .unwrap()
            .cancellation
            .clone();
        assert!(!token.is_cancelled());
        assert!(registry.entry("window-b", &target).is_none());
        let mut other = target.clone();
        other.tab_id = "other-tab".into();
        assert!(registry.entry("window-a", &other).is_none());
        registry.disable("window-b", &target.tab_id);
        assert!(!token.is_cancelled());
        registry.disable("window-a", &target.tab_id);
        assert!(token.is_cancelled());
        assert!(registry.entry("window-a", &target).is_none());
    }

    #[test]
    fn reconnect_and_reenable_never_reuse_old_rea_permission() {
        let mut registry = ReaActivationRegistry::default();
        let mut target = activation_target();
        registry.enable("window", target.clone(), activation_status());
        let old = registry
            .entry("window", &target)
            .unwrap()
            .cancellation
            .clone();
        target.session_revision = "2".into();
        assert!(registry.entry("window", &target).is_none());
        assert!(old.is_cancelled());
        registry.enable("window", target.clone(), activation_status());
        let current = registry
            .entry("window", &target)
            .unwrap()
            .cancellation
            .clone();
        assert!(!current.is_cancelled());
        registry.enable("window", target.clone(), activation_status());
        assert!(current.is_cancelled());
        assert!(!registry
            .entry("window", &target)
            .unwrap()
            .cancellation
            .is_cancelled());
    }

    #[test]
    fn rea_redaction_preserves_large_schema_structure_and_hides_credentials() {
        let mut schema = json!({"name":"inspect","inputSchema":{"type":"object","description":"x".repeat(2000),"properties":(0..180).map(|n| (format!("field_{n}"), json!({"type":"string"}))).collect::<serde_json::Map<_, _>>()},"report":{"password":"sensitive","path":"/remote/app"},"content":[{"type":"text","text":"{\"api_key\":\"sensitive\",\"modules\":[\"index.js\"]}"}]});
        sanitize_rea_value(&mut schema, 0);
        assert_eq!(schema["name"], "inspect");
        assert_eq!(
            schema["inputSchema"]["properties"]
                .as_object()
                .unwrap()
                .len(),
            180
        );
        assert_eq!(
            schema["inputSchema"]["description"].as_str().unwrap().len(),
            2000
        );
        assert_eq!(schema["report"]["path"], "/remote/app");
        assert!(!schema.to_string().contains("sensitive"));
        assert!(schema.to_string().contains("index.js"));
    }

    #[test]
    fn provider_schemas_expose_rea_only_for_approved_server_targets() {
        for kind in [
            AiProviderKind::OpenaiCompatibleChat,
            AiProviderKind::OpenaiResponses,
            AiProviderKind::AnthropicMessages,
        ] {
            assert_eq!(provider_tool_schemas(kind.clone(), None).len(), 2);
            let mut context = AiPromptContext {
                mode: AiContextMode::Level2,
                preview: String::new(),
                network_device: false,
                rea_enabled: false,
            };
            assert_eq!(provider_tool_schemas(kind.clone(), Some(&context)).len(), 3);
            context.rea_enabled = true;
            let schemas = provider_tool_schemas(kind.clone(), Some(&context));
            assert_eq!(schemas.len(), 4);
            let definition = if kind == AiProviderKind::OpenaiCompatibleChat {
                &schemas[3]["function"]
            } else {
                &schemas[3]
            };
            assert_eq!(definition["name"], REA_TOOL);
            let parameters = if kind == AiProviderKind::AnthropicMessages {
                &definition["input_schema"]
            } else {
                &definition["parameters"]
            };
            assert_eq!(parameters["additionalProperties"], false);
            assert_eq!(parameters["required"].as_array().unwrap().len(), 5);
            context.network_device = true;
            assert_eq!(provider_tool_schemas(kind, Some(&context)).len(), 2);
        }
    }

    #[test]
    fn rea_history_retains_json_arguments_and_filters_credentials() {
        let safe: Value = serde_json::from_str(&provider_safe_tool_arguments(r#"{"action":"call","name":"inspect","argumentsJson":"{\"path\":\"/app\"}","query":"","explanation":"inspect","sudoPassword":"secret"}"#)).unwrap();
        assert_eq!(safe["action"], "call");
        assert_eq!(safe["argumentsJson"], "{\"path\":\"/app\"}");
        assert!(safe.get("sudoPassword").is_none());
    }

    #[test]
    fn malformed_rea_operations_fail_before_connecting() {
        for arguments in [
            r#"{"action":"exec","name":"x"}"#,
            r#"{"action":"list","command":"rm -rf /"}"#,
            "[]",
        ] {
            let call = ProviderToolCall {
                id: "call".into(),
                item_id: None,
                google_thought_signature: None,
                name: REA_TOOL.into(),
                arguments: arguments.into(),
            };
            assert!(parse_rea_arguments(&call).is_err());
        }
    }
}
