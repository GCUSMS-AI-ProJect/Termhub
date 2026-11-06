#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
fn set_macos_process_name() {
    use objc2_foundation::{NSProcessInfo, NSString};

    NSProcessInfo::processInfo().setProcessName(&NSString::from_str("TermHub"));
}

fn main() {
    #[cfg(target_os = "windows")]
    if std::env::args_os()
        .nth(1)
        .is_some_and(|arg| arg == "--transterm-scheduler-diagnostic")
    {
        transterm_lib::services::logging::run_scheduler_helper();
        return;
    }
    #[cfg(target_os = "windows")]
    if std::env::args_os()
        .nth(1)
        .is_some_and(|arg| arg == "--transterm-portable-update")
    {
        if transterm_lib::services::updates::portable::run_helper().is_err() {
            std::process::exit(1);
        }
        return;
    }
    #[cfg(target_os = "windows")]
    transterm_lib::services::updates::portable::cleanup_completed();
    let arguments = std::env::args().collect::<Vec<_>>();
    if arguments.get(1).is_some_and(|argument| argument == "mcp") {
        if let Err(error) = transterm_lib::run_mcp_stdio(&arguments[2..]) {
            eprintln!("TermHub MCP failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    if arguments.get(1).is_some() {
        if let Err(error) = transterm_lib::run_cli(&arguments[1..]) {
            eprintln!("TermHub CLI failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    #[cfg(target_os = "macos")]
    set_macos_process_name();
    transterm_lib::run()
}
