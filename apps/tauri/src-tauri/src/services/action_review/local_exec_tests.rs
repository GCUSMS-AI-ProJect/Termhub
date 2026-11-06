#[cfg(test)]
mod local_exec_tests {
    use super::*;

    fn launch() -> crate::sessions::local_terminal::LocalTerminalLaunch {
        crate::sessions::local_terminal::LocalTerminalLaunch {
            shell: if cfg!(windows) {
                "powershell.exe".into()
            } else {
                "/bin/sh".into()
            },
            title: None,
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            args: vec![],
            env: Default::default(),
        }
    }

    #[tokio::test]
    async fn local_command_uses_selected_directory_and_reports_exit_and_output() {
        let directory =
            std::env::temp_dir().join(format!("termhub-local-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        std::fs::write(directory.join("proof.txt"), "workspace-proof").unwrap();
        let command = if cfg!(windows) {
            "Get-Content ./proof.txt; exit 7"
        } else {
            "cat ./proof.txt; exit 7"
        };
        let result = run_local_command(
            &launch(),
            command,
            &directory,
            Duration::from_secs(15),
            &CancellationToken::new(),
            Arc::new(|_| {}),
        )
        .await
        .unwrap();
        assert!(result.output.contains("workspace-proof"));
        assert_eq!(result.exit_code, Some(7));
        assert!(!result.timed_out);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn local_cancellation_keeps_output_and_stops_without_waiting_for_shell_timeout() {
        let cancellation = CancellationToken::new();
        let stop = cancellation.clone();
        let command = if cfg!(windows) {
            "Write-Output 'ready'; Start-Sleep -Seconds 30"
        } else {
            "printf 'ready\\n'; sleep 30"
        };
        let started = Instant::now();
        let result = run_local_command(
            &launch(),
            command,
            &std::env::temp_dir(),
            Duration::from_secs(35),
            &cancellation,
            Arc::new(move |output| {
                if output.contains("ready") {
                    stop.cancel();
                }
            }),
        )
        .await
        .unwrap();
        assert!(cancellation.is_cancelled());
        assert!(started.elapsed() < Duration::from_secs(15));
        assert!(result.output.contains("ready"));
    }

    #[tokio::test]
    async fn local_timeout_returns_partial_output() {
        let command = if cfg!(windows) {
            "Write-Output 'started'; Start-Sleep -Seconds 30"
        } else {
            "printf 'started\\n'; sleep 30"
        };
        let result = run_local_command(
            &launch(),
            command,
            &std::env::temp_dir(),
            Duration::from_secs(2),
            &CancellationToken::new(),
            Arc::new(|_| {}),
        )
        .await
        .unwrap();
        assert!(result.timed_out);
        assert!(result.output.contains("started"));
    }

    #[tokio::test]
    async fn local_cancellation_stops_descendants_that_would_write_after_the_shell_exits() {
        let directory =
            std::env::temp_dir().join(format!("termhub-process-tree-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let ready = directory.join("ready").to_string_lossy().into_owned();
        let leaked = directory.join("leaked").to_string_lossy().into_owned();
        let command = if cfg!(windows) {
            // Controlled temp paths are quoted once for the nested PowerShell
            // argument and once for the outer shell; never derive script text
            // from model input in this test helper.
            let child = format!("[IO.File]::WriteAllText('{}','ready'); Start-Sleep -Seconds 2; [IO.File]::WriteAllText('{}','leak')", ready.replace('\'', "''"), leaked.replace('\'', "''"));
            format!("Start-Process -WindowStyle Hidden -FilePath powershell.exe -ArgumentList '-NoProfile','-Command','{}'; while (!(Test-Path -LiteralPath '{}')) {{ Start-Sleep -Milliseconds 20 }}; Write-Output 'child-ready'; Start-Sleep -Seconds 30", child.replace('\'', "''"), ready.replace('\'', "''"))
        } else {
            format!("(touch '{}'; sleep 2; touch '{}') & while [ ! -f '{}' ]; do sleep 0.02; done; printf 'child-ready\\n'; sleep 30", ready.replace('\'', "'\\''"), leaked.replace('\'', "'\\''"), ready.replace('\'', "'\\''"))
        };
        let cancellation = CancellationToken::new();
        let stop = cancellation.clone();
        let result = run_local_command(
            &launch(),
            &command,
            &directory,
            Duration::from_secs(15),
            &cancellation,
            Arc::new(move |output| {
                if output.contains("child-ready") {
                    stop.cancel();
                }
            }),
        )
        .await
        .unwrap();
        assert!(result.output.contains("child-ready"), "{}", result.output);
        tokio::time::sleep(Duration::from_secs(3)).await;
        assert!(
            !directory.join("leaked").exists(),
            "cancelled command left a running descendant"
        );
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn unsupported_shell_cannot_silently_run_in_another_environment() {
        let mut launch = launch();
        launch.shell = "wsl.exe".into();
        assert!(local_command_process(&launch, "echo test", &std::env::temp_dir()).is_err());
        let mut output = Vec::new();
        let mut truncated = false;
        append_local_output(
            &mut output,
            &vec![b'a'; LOCAL_COMMAND_OUTPUT_LIMIT + 20],
            &mut truncated,
        );
        assert_eq!(output.len(), LOCAL_COMMAND_OUTPUT_LIMIT);
        assert!(truncated);
    }
}
