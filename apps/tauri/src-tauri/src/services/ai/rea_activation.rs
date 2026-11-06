// Explicit, process-local permission. Target changes require a fresh enable.
struct ReaActivationEntry {
    target: AiContextTarget,
    status: crate::services::rea::ReaStatus,
    cancellation: CancellationToken,
}

impl Drop for ReaActivationEntry {
    fn drop(&mut self) {
        self.cancellation.cancel();
    }
}

#[derive(Default)]
struct ReaActivationRegistry {
    entries: HashMap<(String, String), ReaActivationEntry>,
}

impl ReaActivationRegistry {
    fn entry(&mut self, window: &str, target: &AiContextTarget) -> Option<&ReaActivationEntry> {
        let key = (window.to_owned(), target.tab_id.clone());
        if self.entries.get(&key).is_some_and(|e| e.target != *target) {
            self.entries.remove(&key);
        }
        self.entries
            .get(&key)
            .filter(|e| !e.cancellation.is_cancelled())
    }
    fn disable(&mut self, window: &str, tab_id: &str) {
        self.entries.remove(&(window.to_owned(), tab_id.to_owned()));
    }
    fn enable(
        &mut self,
        window: &str,
        target: AiContextTarget,
        status: crate::services::rea::ReaStatus,
    ) {
        self.entries.insert(
            (window.to_owned(), target.tab_id.clone()),
            ReaActivationEntry {
                target,
                status,
                cancellation: CancellationToken::new(),
            },
        );
    }
}

static REA_ACTIVATIONS: LazyLock<Mutex<ReaActivationRegistry>> =
    LazyLock::new(|| Mutex::new(ReaActivationRegistry::default()));

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaActivation {
    enabled: bool,
    status: Option<crate::services::rea::ReaStatus>,
}

fn rea_activation_token(window: &str, target: &AiContextTarget) -> Option<CancellationToken> {
    REA_ACTIVATIONS
        .lock()
        .ok()?
        .entry(window, target)
        .map(|e| e.cancellation.clone())
}

fn rea_request_token(prepared: &PreparedChatRequest) -> Option<CancellationToken> {
    rea_activation_token(
        prepared.source_window_label.as_deref()?,
        &prepared.context_attachment.as_ref()?.target,
    )
}

pub async fn get_rea_activation(
    app: &AppHandle,
    window: &WebviewWindow,
    input: CheckReaInput,
) -> Result<ReaActivation, AppError> {
    let (target, _) =
        resolve_context_target(app, &input.tab_id, Some(&input.root_tab_id), false).await?;
    let mut registry = REA_ACTIVATIONS
        .lock()
        .map_err(|_| ai_error("REA_STATE", "REA 状态不可用"))?;
    let status = registry
        .entry(window.label(), &target)
        .map(|entry| entry.status.clone());
    Ok(ReaActivation {
        enabled: status.is_some(),
        status,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetReaEnabledInput {
    #[serde(flatten)]
    check: CheckReaInput,
    enabled: bool,
}

pub async fn set_rea_enabled(
    app: &AppHandle,
    window: &WebviewWindow,
    input: SetReaEnabledInput,
    on_progress: Option<Channel<crate::services::rea::progress::ReaPreparationProgress>>,
) -> Result<ReaActivation, AppError> {
    // Disable also works after disconnect, and invalidates an in-flight enable.
    {
        let checks = REA_CHECKS
            .lock()
            .map_err(|_| ai_error("REA_STATE", "REA 状态不可用"))?;
        if let Some(check) = checks.get(window.label()) {
            if check.tab_id == input.check.tab_id {
                check.cancellation.cancel();
            }
        }
    }
    REA_ACTIVATIONS
        .lock()
        .map_err(|_| ai_error("REA_STATE", "REA 状态不可用"))?
        .disable(window.label(), &input.check.tab_id);
    if !input.enabled {
        return Ok(ReaActivation {
            enabled: false,
            status: None,
        });
    }
    let status = run_rea_check(app, window, input.check, true, on_progress).await?;
    Ok(ReaActivation {
        enabled: true,
        status: Some(status),
    })
}
