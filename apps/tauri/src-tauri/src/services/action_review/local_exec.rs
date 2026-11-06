// Local Copilot commands use the same approval/guardrail boundary as SSH, but
// execute in a dedicated process. They never inherit interactive sudo/su state.
pub type LocalCommandProgress = Arc<dyn Fn(&str) + Send + Sync>;
const LOCAL_COMMAND_OUTPUT_LIMIT: usize = 256 * 1024;

pub fn command_needs_privileged_auth(command: &str) -> bool {
    privileged_command_kind(command).is_some()
}

pub async fn execute_local_command_cancellable(
    app: &AppHandle,
    request: RemoteExecRequest,
    cancellation: &CancellationToken,
    progress: LocalCommandProgress,
) -> Result<RemoteExecResult, AppError> {
    check_cancellation(Some(cancellation))?;
    let command = validate_remote_exec_command(&request.command)?;
    let state = app.state::<crate::services::workspace::WorkspaceState>();
    let tab_id = validate_remote_exec_tab_id(&request.tab_id)?;
    let bound_revision = request.expected_session_revision.clone().ok_or_else(|| {
        AppError::Command("AI_CONTEXT_TARGET_CHANGED: 本地命令缺少已确认的会话绑定".into())
    })?;
    if !state
        .tabs
        .read()
        .await
        .iter()
        .any(|tab| tab.id == tab_id && tab.session_type == "local")
    {
        return Err(AppError::Command(
            "AI_CONTEXT_TARGET_CHANGED: 本地终端已关闭".into(),
        ));
    }
    ensure_expected_session_revision(
        &state,
        &tab_id,
        request.expected_session_revision.as_deref(),
    )
    .await?;
    let launch = state
        .local_terminal_launches
        .read()
        .await
        .get(&tab_id)
        .cloned()
        .ok_or_else(|| AppError::Command("本地终端 Shell 配置不可用".into()))?;
    let cwd = {
        let sessions = state.sessions.read().await;
        let session = sessions
            .get(&tab_id)
            .filter(|session| session.connected)
            .ok_or_else(|| AppError::Command("AI_CONTEXT_TARGET_CHANGED: 本地终端已断开".into()))?;
        request
            .cwd
            .or_else(|| session.shell_cwd.clone())
            .unwrap_or_else(|| launch.cwd.clone())
    };
    let cwd = std::path::PathBuf::from(cwd);
    if !cwd.is_absolute() || !cwd.is_dir() {
        return Err(AppError::Command(
            "本地工作目录必须是已存在的绝对目录".into(),
        ));
    }
    let timeout_duration = Duration::from_millis(
        request
            .timeout_ms
            .unwrap_or(DEFAULT_BACKGROUND_REMOTE_EXEC_TIMEOUT_MS)
            .clamp(
                MIN_REMOTE_EXEC_TIMEOUT_MS,
                DEFAULT_BACKGROUND_REMOTE_EXEC_TIMEOUT_MS,
            ),
    );
    ensure_expected_session_revision(
        &state,
        &tab_id,
        request.expected_session_revision.as_deref(),
    )
    .await?;
    let local_cancellation = cancellation.child_token();
    let execution = run_local_command(
        &launch,
        &command,
        &cwd,
        timeout_duration,
        &local_cancellation,
        progress,
    );
    tokio::pin!(execution);
    let mut monitor = tokio::time::interval(Duration::from_millis(200));
    loop {
        tokio::select! {
            result = &mut execution => return result,
            _ = monitor.tick() => {
                let connected = state.sessions.read().await.get(&tab_id).is_some_and(|session| session.connected);
                if !connected || state.ai_session_revision(&tab_id).await.to_string() != bound_revision {
                    local_cancellation.cancel();
                    let _ = execution.await;
                    return Err(AppError::Command("AI_CONTEXT_TARGET_CHANGED: 本地会话已变化，任务已停止".into()));
                }
            }
        }
    }
}

fn local_command_process(
    launch: &crate::sessions::local_terminal::LocalTerminalLaunch,
    command: &str,
    cwd: &std::path::Path,
) -> Result<tokio::process::Command, AppError> {
    let name = launch
        .shell
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let name = name.strip_suffix(".exe").unwrap_or(&name);
    let mut process = tokio::process::Command::new(&launch.shell);
    match name {
        "pwsh" | "powershell" => {
            let script = format!("[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding; {command}");
            process.args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ]);
        }
        "cmd" => {
            process.args(["/D", "/S", "/C", command]);
        }
        "bash" | "sh" | "dash" | "zsh" | "ksh" | "mksh" | "fish" | "nu" | "elvish" | "xonsh"
        | "tcsh" => {
            process.args(["-c", command]);
        }
        _ => {
            return Err(AppError::Command(format!(
                "当前本地 Shell {name} 不支持独立命令执行，请在可见终端中操作"
            )))
        }
    }
    process
        .current_dir(cwd)
        .envs(&launch.env)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    process.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    #[cfg(unix)]
    process.process_group(0);
    Ok(process)
}

async fn local_output_reader<R: tokio::io::AsyncRead + Unpin>(
    mut reader: R,
    sender: tokio::sync::mpsc::Sender<Vec<u8>>,
) {
    use tokio::io::AsyncReadExt;
    let mut buffer = [0u8; 4096];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) | Err(_) => break,
            Ok(length) => {
                if sender.send(buffer[..length].to_vec()).await.is_err() {
                    break;
                }
            }
        }
    }
}

async fn run_local_command(
    launch: &crate::sessions::local_terminal::LocalTerminalLaunch,
    command: &str,
    cwd: &std::path::Path,
    timeout_duration: Duration,
    cancellation: &CancellationToken,
    progress: LocalCommandProgress,
) -> Result<RemoteExecResult, AppError> {
    check_cancellation(Some(cancellation))?;
    let mut process = local_command_process(launch, command, cwd)?;
    let mut child = process
        .spawn()
        .map_err(|error| AppError::Command(format!("本地命令启动失败：{error}")))?;
    let tree = LocalProcessTree::attach(&mut child)?;
    let (sender, mut receiver) = tokio::sync::mpsc::channel(32);
    let stdout = tokio::spawn(local_output_reader(
        child.stdout.take().expect("piped stdout"),
        sender.clone(),
    ));
    let stderr = tokio::spawn(local_output_reader(
        child.stderr.take().expect("piped stderr"),
        sender,
    ));
    let mut output = Vec::new();
    let mut truncated = false;
    let mut timed_out = false;
    let mut exit_code = None;
    let deadline = tokio::time::sleep(timeout_duration);
    tokio::pin!(deadline);
    let mut heartbeat = tokio::time::interval(Duration::from_millis(250));
    loop {
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => break,
            _ = &mut deadline => { timed_out = true; break; },
            result = child.wait() => {
                exit_code = result.ok().and_then(|status| status.code()).map(|code| code as u32);
                break;
            }
            _ = heartbeat.tick() => progress(&String::from_utf8_lossy(&output)),
            Some(chunk) = receiver.recv() => {
                append_local_output(&mut output, &chunk, &mut truncated);
                progress(&String::from_utf8_lossy(&output));
            }
        }
    }
    // A shell may exit while a spawned descendant still holds output pipes.
    // End the whole owned process tree and then drain only already produced data.
    drop(tree);
    let _ = child.kill().await;
    let _ = child.wait().await;
    let drain_deadline = tokio::time::sleep(Duration::from_millis(200));
    tokio::pin!(drain_deadline);
    loop {
        tokio::select! {
            _ = &mut drain_deadline => break,
            chunk = receiver.recv() => match chunk {
                Some(chunk) => append_local_output(&mut output, &chunk, &mut truncated),
                None => break,
            }
        }
    }
    stdout.abort();
    stderr.abort();
    let output = String::from_utf8_lossy(&output).into_owned();
    progress(&output);
    Ok(RemoteExecResult {
        output,
        exit_code,
        timed_out,
        output_truncated: truncated,
        raw_terminal: false,
        input_required: false,
        input_kind: None,
    })
}

fn append_local_output(output: &mut Vec<u8>, chunk: &[u8], truncated: &mut bool) {
    let available = LOCAL_COMMAND_OUTPUT_LIMIT.saturating_sub(output.len());
    output.extend_from_slice(&chunk[..chunk.len().min(available)]);
    *truncated |= chunk.len() > available;
}

#[cfg(windows)]
struct LocalProcessTree(usize);
#[cfg(windows)]
impl LocalProcessTree {
    fn attach(child: &mut tokio::process::Child) -> Result<Self, AppError> {
        use windows_sys::Win32::System::JobObjects::*;
        // SAFETY: the job is owned here; the child handle remains live until wait.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                let _ = child.start_kill();
                return Err(AppError::Command("无法创建本地任务进程组".into()));
            }
            let tree = Self(job as usize);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || child
                    .raw_handle()
                    .is_none_or(|handle| AssignProcessToJobObject(job, handle.cast()) == 0)
            {
                let _ = child.start_kill();
                return Err(AppError::Command("无法绑定本地任务进程组".into()));
            }
            Ok(tree)
        }
    }
}
#[cfg(windows)]
impl Drop for LocalProcessTree {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as _);
        }
    }
}
#[cfg(unix)]
struct LocalProcessTree(i32);
#[cfg(unix)]
impl LocalProcessTree {
    fn attach(child: &mut tokio::process::Child) -> Result<Self, AppError> {
        child
            .id()
            .map(|id| Self(id as i32))
            .ok_or_else(|| AppError::Command("本地任务已退出".into()))
    }
}
#[cfg(unix)]
impl Drop for LocalProcessTree {
    fn drop(&mut self) {
        unsafe {
            libc::kill(-self.0, libc::SIGKILL);
        }
    }
}
