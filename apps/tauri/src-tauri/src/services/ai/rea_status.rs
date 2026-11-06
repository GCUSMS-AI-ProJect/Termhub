// Window-scoped, cancellable readiness checks. These never send data to a model.
struct ReaCheck {
    request_id: String,
    tab_id: String,
    cancellation: CancellationToken,
}
static REA_CHECKS: LazyLock<Mutex<HashMap<String, ReaCheck>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckReaInput {
    tab_id: String,
    root_tab_id: String,
    request_id: String,
}

pub async fn check_rea(
    app: &AppHandle,
    window: &WebviewWindow,
    input: CheckReaInput,
    on_progress: Option<Channel<crate::services::rea::progress::ReaPreparationProgress>>,
) -> Result<crate::services::rea::ReaStatus, AppError> {
    run_rea_check(app, window, input, false, on_progress).await
}

async fn run_rea_check(
    app: &AppHandle,
    window: &WebviewWindow,
    input: CheckReaInput,
    enable: bool,
    on_progress: Option<Channel<crate::services::rea::progress::ReaPreparationProgress>>,
) -> Result<crate::services::rea::ReaStatus, AppError> {
    if input.request_id.is_empty() || input.request_id.len() > 128 {
        return Err(ai_error("REA_ARGUMENTS", "无效检查请求"));
    }
    let label = window.label().to_owned();
    let token = CancellationToken::new();
    let request_id = input.request_id.clone();
    let progress_token = token.clone();
    let progress: crate::services::rea::progress::ProgressReporter = on_progress.map(|channel| {
        Arc::new(move |stage| {
            if !progress_token.is_cancelled() {
                let _ = channel.send(crate::services::rea::progress::ReaPreparationProgress {
                    request_id: request_id.clone(),
                    stage,
                });
            }
        }) as Arc<dyn Fn(crate::services::rea::progress::ReaPreparationStage) + Send + Sync>
    });
    {
        let mut checks = REA_CHECKS
            .lock()
            .map_err(|_| ai_error("REA_STATE", "REA 状态不可用"))?;
        if let Some(previous) = checks.insert(
            label.clone(),
            ReaCheck {
                request_id: input.request_id.clone(),
                tab_id: input.tab_id.clone(),
                cancellation: token.clone(),
            },
        ) {
            previous.cancellation.cancel();
        }
    }
    let operation = async {
        let (target, _) =
            resolve_context_target(app, &input.tab_id, Some(&input.root_tab_id), false).await?;
        let status = crate::services::rea::check(
            app,
            &target.tab_id,
            &target.session_revision,
            &token,
            progress,
        )
        .await?;
        let (current, _) =
            resolve_context_target(app, &input.tab_id, Some(&input.root_tab_id), false).await?;
        if current != target {
            return Err(ai_error("REA_TARGET_CHANGED", "分析目标已变化"));
        }
        if enable {
            // Serialize commit with cancel/disable: a late result cannot re-enable.
            let checks = REA_CHECKS
                .lock()
                .map_err(|_| ai_error("REA_STATE", "REA 状态不可用"))?;
            if token.is_cancelled()
                || !checks
                    .get(&label)
                    .is_some_and(|c| c.request_id == input.request_id)
            {
                return Err(ai_error("REA_CANCELLED", "已取消 REA 开启"));
            }
            REA_ACTIVATIONS
                .lock()
                .map_err(|_| ai_error("REA_STATE", "REA 状态不可用"))?
                .enable(&label, target, status.clone());
        }
        Ok(status)
    };
    let result = tokio::select! {
        biased;
        _ = token.cancelled() => Err(ai_error("REA_CANCELLED", "已取消 REA 开启")),
        result = operation => result,
    };
    if let Ok(mut checks) = REA_CHECKS.lock() {
        if checks
            .get(&label)
            .is_some_and(|c| c.request_id == input.request_id)
        {
            checks.remove(&label);
        }
    }
    result
}

pub fn cancel_rea_check(window: &WebviewWindow, request_id: &str) -> Result<(), AppError> {
    let checks = REA_CHECKS
        .lock()
        .map_err(|_| ai_error("REA_STATE", "REA 状态不可用"))?;
    if let Some(check) = checks.get(window.label()) {
        if check.request_id == request_id {
            check.cancellation.cancel();
        }
    }
    Ok(())
}
