//! A private, short-lived real-time system session. Never joins or stops WPR sessions.
use super::scheduler_model::{decode, SchedulerModel, Transition};
use super::scheduler_policy::{exceeds_cpu_budget, CONSUMER_CPU_LIMIT_100NS};
use super::scheduler_sessions::{Owner, Session};
use serde_json::{json, Value};
use std::ptr::null;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use windows_sys::core::GUID;
use windows_sys::Win32::Foundation::{
    GetLastError, ERROR_ACCESS_DENIED, ERROR_PRIVILEGE_NOT_HELD, FILETIME,
};
use windows_sys::Win32::System::Diagnostics::Etw::*;
use windows_sys::Win32::System::Threading::{GetCurrentThread, GetThreadTimes};

const THREAD_PROVIDER: GUID = GUID::from_u128(0x3d6fa8d1_fe05_11d0_9dda_00c04fd7ba7c);
const EVENT_LIMIT: u64 = 250_000;

fn thread_cpu() -> Option<u64> {
    let (mut created, mut exited, mut kernel, mut user) = (
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
    );
    if unsafe {
        GetThreadTimes(
            GetCurrentThread(),
            &mut created,
            &mut exited,
            &mut kernel,
            &mut user,
        )
    } == 0
    {
        return None;
    }
    let ticks =
        |time: FILETIME| (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime);
    Some(ticks(kernel).saturating_add(ticks(user)))
}

fn system_time() -> u64 {
    // FILETIME epoch used by ProcessTrace's default timestamp conversion.
    116_444_736_000_000_000
        + SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64
            / 100
}

struct Consumer {
    model: SchedulerModel,
    stop: Arc<AtomicBool>,
    events: u64,
    unsupported: u64,
    cpu_started: Option<u64>,
    budget_exceeded: bool,
    started_at: u64,
    last_at: u64,
}

unsafe extern "system" fn event(record: *mut EVENT_RECORD) {
    // ETW invokes this serially on the ProcessTrace thread, with our stable stack context.
    let record = unsafe { &*record };
    let consumer = unsafe { &mut *record.UserContext.cast::<Consumer>() };
    if consumer.stop.load(Ordering::Relaxed) {
        return;
    }
    consumer.events += 1;
    if consumer.events > EVENT_LIMIT
        || (consumer.events % 4096 == 0
            && exceeds_cpu_budget(
                consumer
                    .cpu_started
                    .zip(thread_cpu())
                    .map(|(started, cpu)| cpu.saturating_sub(started)),
                CONSUMER_CPU_LIMIT_100NS,
            ))
    {
        consumer.budget_exceeded = true;
        consumer.stop.store(true, Ordering::Relaxed);
        return;
    }
    let header = &record.EventHeader;
    if header.ProviderId.data1 != THREAD_PROVIDER.data1
        || header.ProviderId.data2 != THREAD_PROVIDER.data2
        || header.ProviderId.data3 != THREAD_PROVIDER.data3
        || header.ProviderId.data4 != THREAD_PROVIDER.data4
        || !matches!(header.EventDescriptor.Opcode, 36 | 50)
    {
        return;
    }
    if record.UserData.is_null() || header.TimeStamp < 0 {
        consumer.unsupported += 1;
        return;
    }
    let at = header.TimeStamp as u64;
    if at < consumer.started_at {
        return;
    }
    consumer.last_at = consumer.last_at.max(at);
    let data = unsafe {
        std::slice::from_raw_parts(record.UserData.cast::<u8>(), record.UserDataLength as usize)
    };
    match decode(
        header.EventDescriptor.Opcode,
        header.EventDescriptor.Version,
        data,
    ) {
        Some(Transition::Ready(tid)) => consumer.model.ready(tid, at),
        Some(Transition::SwappedOut(tid)) => consumer.model.swapped_out(tid),
        Some(Transition::Switch {
            incoming,
            outgoing,
            state,
        }) => {
            let cpu = if header.Flags & EVENT_HEADER_FLAG_PROCESSOR_INDEX as u16 != 0 {
                unsafe { record.BufferContext.Anonymous.ProcessorIndex }
            } else {
                u16::from(unsafe { record.BufferContext.Anonymous.Anonymous.ProcessorNumber })
            };
            consumer.model.switch(cpu, at, incoming, outgoing, state);
        }
        None => consumer.unsupported += 1,
    }
}

pub(super) fn capture(owner: Owner, model: SchedulerModel) -> Value {
    let mut session = match Session::start(owner) {
        Ok(session) => session,
        Err(error) => {
            return json!({"status": "unavailable", "stage": "start-trace", "errorCode": error,
            "requiresElevation": matches!(error, ERROR_ACCESS_DENIED | ERROR_PRIVILEGE_NOT_HELD)})
        }
    };
    let stop = Arc::new(AtomicBool::new(false));
    let consumer_stop = stop.clone();
    let started_at = system_time();
    let name = session.name();
    let reader = std::thread::Builder::new().name("scheduler-etw-consumer".into()).spawn(move || {
        let mut consumer = Consumer { model, stop: consumer_stop, events: 0, unsupported: 0,
            cpu_started: thread_cpu(), budget_exceeded: false, started_at, last_at: started_at };
        let mut name = name;
        let mut logfile = EVENT_TRACE_LOGFILEW { LoggerName: name.as_mut_ptr(),
            Context: (&mut consumer as *mut Consumer).cast(), ..Default::default() };
        logfile.Anonymous1.ProcessTraceMode = PROCESS_TRACE_MODE_REAL_TIME | PROCESS_TRACE_MODE_EVENT_RECORD;
        logfile.Anonymous2.EventRecordCallback = Some(event);
        let handle = unsafe { OpenTraceW(&mut logfile) };
        if handle.Value == u64::MAX {
            consumer.stop.store(true, Ordering::Relaxed);
            let error = unsafe { GetLastError() };
            return json!({"status": "unavailable", "stage": "open-trace", "errorCode": error,
                "requiresElevation": matches!(error, ERROR_ACCESS_DENIED | ERROR_PRIVILEGE_NOT_HELD)});
        }
        let error = unsafe { ProcessTrace(&handle, 1, null(), null()) };
        unsafe { CloseTrace(handle); }
        let mut report = consumer.model.report(consumer.last_at);
        report["status"] = json!("captured");
        report["processTraceErrorCode"] = json!(error);
        report["receivedEvents"] = json!(consumer.events);
        report["unsupportedEvents"] = json!(consumer.unsupported);
        let cpu_used = consumer.cpu_started.zip(thread_cpu()).map(|(started, cpu)| cpu.saturating_sub(started));
        consumer.budget_exceeded |= exceeds_cpu_budget(cpu_used, CONSUMER_CPU_LIMIT_100NS);
        report["budgetExceeded"] = json!(consumer.budget_exceeded);
        report["consumerCpuMs"] = json!(cpu_used.map(|cpu| cpu as f64 / 10_000.0));
        report["windowStartedUnixMs"] = json!((started_at - 116_444_736_000_000_000) / 10_000);
        report["observedWindowMs"] = json!(consumer.last_at.saturating_sub(started_at) as f64 / 10_000.0);
        report["evidenceUsable"] = json!(error == 0 && consumer.unsupported == 0 && !consumer.budget_exceeded
            && consumer.model.tracked_transitions > 0 && consumer.model.discontinuities == 0);
        report
    });
    let reader = match reader {
        Ok(reader) => reader,
        Err(_) => return json!({"status": "unavailable", "stage": "consumer-thread"}),
    };
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(3) && !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(20));
    }
    let stop_error = session.stop();
    let mut report = reader
        .join()
        .unwrap_or_else(|_| json!({"status": "unavailable", "stage": "consumer-panic"}));
    let properties = &session.properties.header;
    report["stopErrorCode"] = json!(stop_error);
    report["eventsLost"] = json!(properties.EventsLost);
    report["buffersLost"] =
        json!(u64::from(properties.RealTimeBuffersLost) + u64::from(properties.LogBuffersLost));
    report["bufferBytes"] =
        json!(u64::from(properties.NumberOfBuffers) * u64::from(properties.BufferSize) * 1024);
    if stop_error != 0
        || properties.EventsLost != 0
        || properties.RealTimeBuffersLost != 0
        || properties.LogBuffersLost != 0
    {
        report["evidenceUsable"] = json!(false);
    }
    report
}
