use super::processes::OwnedHandle;
use super::scheduler_model::ThreadIdentity;
use std::collections::BTreeSet;
use std::mem::size_of;
use windows_sys::Win32::Foundation::{GetLastError, LocalFree, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
};
use windows_sys::Win32::System::Threading::{
    GetProcessIdOfThread, GetThreadDescription, OpenThread, THREAD_QUERY_LIMITED_INFORMATION,
};

pub(super) struct Threads {
    pub identities: Vec<ThreadIdentity>,
    // Retaining the thread objects prevents IDs being recycled during the trace.
    pub handles: Vec<OwnedHandle>,
    pub inaccessible: usize,
    pub truncated: bool,
}

fn role(handle: &OwnedHandle, tid: u32, ui_tid: u32) -> &'static str {
    if tid == ui_tid {
        return "transterm-ui";
    }
    let mut description = std::ptr::null_mut();
    if unsafe { GetThreadDescription(handle.0, &mut description) } < 0 || description.is_null() {
        return "other";
    }
    // Only emit fixed role names; arbitrary thread descriptions may contain user data.
    let mut length = 0;
    while length < 256 && unsafe { *description.add(length) } != 0 {
        length += 1;
    }
    let name = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(description, length) });
    unsafe {
        LocalFree(description.cast());
    }
    match name.as_str() {
        "CrRendererMain" => "renderer-main",
        "CrBrowserMain" => "browser-main",
        "CrGpuMain" => "gpu-main",
        "Chrome_IOThread" => "browser-io",
        "Compositor" | "VizCompositorThread" => "compositor",
        _ => "other",
    }
}

pub(super) fn snapshot(pids: &BTreeSet<u32>, ui_tid: u32) -> Result<Threads, u32> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(unsafe { GetLastError() });
    }
    let snapshot = OwnedHandle(snapshot);
    let mut entry = THREADENTRY32 {
        dwSize: size_of::<THREADENTRY32>() as u32,
        ..Default::default()
    };
    if unsafe { Thread32First(snapshot.0, &mut entry) } == 0 {
        return Err(unsafe { GetLastError() });
    }
    let mut threads = Threads {
        identities: Vec::new(),
        handles: Vec::new(),
        inaccessible: 0,
        truncated: false,
    };
    loop {
        if pids.contains(&entry.th32OwnerProcessID) {
            if threads.identities.len() == 1024 {
                threads.truncated = true;
                break;
            }
            let handle =
                unsafe { OpenThread(THREAD_QUERY_LIMITED_INFORMATION, 0, entry.th32ThreadID) };
            if handle.is_null() {
                threads.inaccessible += 1;
            } else {
                let handle = OwnedHandle(handle);
                if unsafe { GetProcessIdOfThread(handle.0) } == entry.th32OwnerProcessID {
                    threads.identities.push(ThreadIdentity {
                        pid: entry.th32OwnerProcessID,
                        tid: entry.th32ThreadID,
                        role: role(&handle, entry.th32ThreadID, ui_tid),
                    });
                    threads.handles.push(handle);
                } else {
                    threads.inaccessible += 1;
                }
            }
        }
        if unsafe { Thread32Next(snapshot.0, &mut entry) } == 0 {
            let error = unsafe { GetLastError() };
            if error != windows_sys::Win32::Foundation::ERROR_NO_MORE_FILES {
                return Err(error);
            }
            break;
        }
    }
    Ok(threads)
}
