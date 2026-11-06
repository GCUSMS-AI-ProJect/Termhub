//! Headless helper lifecycle contract. Runs on Windows CI without requiring elevation.
#![cfg(target_os = "windows")]

use serde_json::Value;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn helper(arguments: &[&str]) -> Value {
    let started = Instant::now();
    let output = Command::new(env!("CARGO_BIN_EXE_transterm"))
        .arg("--transterm-scheduler-diagnostic")
        .args(arguments)
        .stdin(Stdio::null())
        .output()
        .expect("headless scheduler helper starts");
    assert!(started.elapsed() < Duration::from_secs(8));
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    assert!(output.stdout.len() <= 12 * 1024);
    serde_json::from_slice(&output.stdout).expect("one bounded JSON report")
}

#[test]
fn helper_rejects_bad_arguments_and_unrelated_roots_without_starting_a_webview() {
    assert_eq!(helper(&["0", "0"])["stage"], "helper-arguments");
    assert_eq!(helper(&["not-a-pid", "0"])["stage"], "helper-arguments");
    assert_eq!(helper(&["4294967295", "0"])["stage"], "process-tree");
}

#[test]
fn helper_captures_or_explicitly_reports_missing_kernel_trace_access_then_exits() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    let stopped = Arc::new(AtomicBool::new(false));
    let worker_stopped = stopped.clone();
    let worker = std::thread::spawn(move || {
        while !worker_stopped.load(Ordering::Relaxed) {
            // Produce real ready/dispatch transitions without busy-spinning on a CI core.
            std::thread::sleep(Duration::from_millis(5));
        }
    });
    let report = helper(&[&std::process::id().to_string(), "0"]);
    stopped.store(true, Ordering::Relaxed);
    worker.join().unwrap();
    if report["status"] == "captured" {
        assert!(report["threads"].is_array());
        assert!(report["evidenceUsable"].is_boolean());
        assert!(report["trackedTransitions"].as_u64().unwrap() > 0);
        assert_eq!(report["stopErrorCode"], 0);
        assert_eq!(report["causality"], "not-established");
        assert_eq!(report["interruptTimeAccounted"], false);
        assert_eq!(report["availableCpuCapacityKnown"], false);
        assert!(report.get("processorBusyMs").is_none());
    } else {
        assert_eq!(report["status"], "unavailable");
        match report["stage"].as_str() {
            Some("profile-privilege") => {
                assert_eq!(report["requiresElevation"], true);
                assert!(
                    [5, 1300, 1314].contains(&report["errorCode"].as_u64().unwrap()),
                    "{report}"
                );
            }
            Some("start-trace" | "open-trace") => {
                assert_eq!(report["requiresElevation"], true);
                assert!(
                    [5, 1314].contains(&report["errorCode"].as_u64().unwrap()),
                    "{report}"
                );
            }
            Some("multiple-processor-groups" | "incomplete-cpu-topology") => {}
            _ => panic!("unexpected diagnostic failure: {report}"),
        }
    }
}

#[test]
fn startup_recovery_does_not_start_a_kernel_capture() {
    let report = helper(&[&std::process::id().to_string(), "0", "--recover-only"]);
    if report["status"] == "recovered" {
        assert_eq!(report["captureRequested"], false);
        assert_eq!(report["evidenceUsable"], false);
        assert!(report.get("receivedEvents").is_none());
    } else {
        assert_eq!(report["status"], "unavailable");
        assert_eq!(report["stage"], "profile-privilege", "{report}");
        assert_eq!(report["requiresElevation"], true);
    }
}
