//! Aggregates only observed scheduler transitions; blocked time is never ready-queue time.
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub(super) enum Transition {
    Ready(u32),
    SwappedOut(u32),
    Switch {
        incoming: u32,
        outgoing: u32,
        state: u8,
    },
}

pub(super) fn decode(opcode: u8, version: u8, data: &[u8]) -> Option<Transition> {
    if version != 2 {
        return None;
    }
    let tid = |start| {
        data.get(start..start + 4)
            .map(|bytes| u32::from_le_bytes(bytes.try_into().unwrap()))
    };
    match opcode {
        36 if data.len() >= 24 => Some(Transition::Switch {
            incoming: tid(0)?,
            outgoing: tid(4)?,
            state: data[14],
        }),
        50 if data.len() >= 8 => Some(if data[6] & 0x6 != 0 {
            Transition::SwappedOut(tid(0)?)
        } else {
            Transition::Ready(tid(0)?)
        }),
        _ => None,
    }
}

#[derive(Clone)]
pub(super) struct ThreadIdentity {
    pub pid: u32,
    pub tid: u32,
    pub role: &'static str,
}

struct Thread {
    identity: ThreadIdentity,
    ready_since: Option<u64>,
    runtime: BTreeMap<u16, u64>,
    ready_total: u64,
    ready_max: u64,
    dispatches: u64,
    slow_dispatches: u64,
}

pub(super) struct SchedulerModel {
    threads: BTreeMap<u32, Thread>,
    running: BTreeMap<u16, (u32, u64)>,
    processor_busy: BTreeMap<u16, u64>,
    processor_since: BTreeMap<u16, u64>,
    classes: BTreeMap<u16, u8>,
    pub discontinuities: u64,
    pub tracked_transitions: u64,
}

impl SchedulerModel {
    pub fn new(threads: Vec<ThreadIdentity>, classes: BTreeMap<u16, u8>) -> Self {
        Self {
            threads: threads
                .into_iter()
                .map(|identity| {
                    (
                        identity.tid,
                        Thread {
                            identity,
                            ready_since: None,
                            runtime: BTreeMap::new(),
                            ready_total: 0,
                            ready_max: 0,
                            dispatches: 0,
                            slow_dispatches: 0,
                        },
                    )
                })
                .collect(),
            running: BTreeMap::new(),
            processor_busy: BTreeMap::new(),
            processor_since: BTreeMap::new(),
            classes,
            discontinuities: 0,
            tracked_transitions: 0,
        }
    }

    pub fn ready(&mut self, tid: u32, at: u64) {
        if !self.threads.contains_key(&tid) {
            return;
        }
        if let Some((_, since)) = self.running.values().find(|(running, _)| *running == tid) {
            // Cross-CPU delivery can put a same-timestamp Ready after its dispatch.
            if at > *since {
                self.discontinuities += 1;
            }
            return;
        }
        if let Some(thread) = self.threads.get_mut(&tid) {
            self.tracked_transitions += 1;
            // Duplicate ReadyThread notifications must not shorten an observed wait.
            thread.ready_since.get_or_insert(at);
        }
    }

    pub fn swapped_out(&mut self, tid: u32) {
        if let Some(thread) = self.threads.get_mut(&tid) {
            // A second ReadyThread event follows after the stack/address space is paged in.
            thread.ready_since = None;
        }
    }

    pub fn switch(&mut self, cpu: u16, at: u64, incoming: u32, outgoing: u32, state: u8) {
        self.processor_since.entry(cpu).or_insert(at);
        if self.threads.contains_key(&incoming) || self.threads.contains_key(&outgoing) {
            self.tracked_transitions += 1;
        }
        if let Some((tid, since)) = self.running.remove(&cpu) {
            if tid == outgoing && at >= since {
                if tid != 0 {
                    *self.processor_busy.entry(cpu).or_default() += at - since;
                }
                if let Some(thread) = self.threads.get_mut(&tid) {
                    *thread.runtime.entry(cpu).or_default() += at - since;
                }
            } else {
                self.discontinuities += 1;
            }
        }
        if let Some(thread) = self.threads.get_mut(&outgoing) {
            // KTHREAD_STATE Ready=1: preempted runnable work rejoins the ready queue.
            thread.ready_since = (state == 1).then_some(at);
        }
        if let Some(thread) = self.threads.get_mut(&incoming) {
            if let Some(since) = thread.ready_since.take() {
                if let Some(wait) = at.checked_sub(since) {
                    thread.ready_total += wait;
                    thread.ready_max = thread.ready_max.max(wait);
                    thread.dispatches += 1;
                    thread.slow_dispatches += u64::from(wait >= 160_000);
                } else {
                    self.discontinuities += 1;
                }
            }
        }
        self.running.insert(cpu, (incoming, at));
    }

    pub fn report(&self, end: u64) -> Value {
        let mut threads: Vec<_> = self.threads.values().collect();
        // Preserve named UI/render threads even when stalled and consuming no CPU.
        threads.sort_by_key(|thread| {
            (
                match thread.identity.role {
                    "transterm-ui" => 0,
                    "renderer-main" => 1,
                    "browser-main" | "gpu-main" => 2,
                    "other" => 4,
                    _ => 3,
                },
                std::cmp::Reverse(
                    thread.runtime.values().sum::<u64>()
                        + thread.ready_total
                        + thread
                            .ready_since
                            .map(|at| end.saturating_sub(at))
                            .unwrap_or(0)
                        + self
                            .running
                            .values()
                            .filter(|(tid, _)| *tid == thread.identity.tid)
                            .map(|(_, at)| end.saturating_sub(*at))
                            .sum::<u64>(),
                ),
                thread.identity.tid,
            )
        });
        let sampled = threads.len();
        let threads: Vec<_> = threads.into_iter().take(12).map(|thread| {
            let mut by_class: BTreeMap<u8, u64> = BTreeMap::new();
            let mut unknown = 0;
            for (cpu, time) in &thread.runtime {
                if let Some(class) = self.classes.get(cpu) {
                    *by_class.entry(*class).or_default() += time;
                } else { unknown += time; }
            }
            json!({
                "pid": thread.identity.pid, "tid": thread.identity.tid, "role": thread.identity.role,
                "runtimeByEfficiencyClassMs": by_class.into_iter().map(|(class, time)|
                    json!({"class": class, "ms": time as f64 / 10_000.0})).collect::<Vec<_>>(),
                "runtimeByProcessorMs": thread.runtime.iter().take(8).map(|(cpu, time)|
                    json!({"processor": cpu, "ms": *time as f64 / 10_000.0})).collect::<Vec<_>>(),
                "processorsTruncated": thread.runtime.len() > 8,
                "unknownProcessorMs": unknown as f64 / 10_000.0,
                "runningAtWindowEnd": self.running.iter().filter(|(_, (tid, _))| *tid == thread.identity.tid)
                    .map(|(cpu, (_, since))| json!({"processor": cpu, "class": self.classes.get(cpu),
                        "observedMsLowerBound": end.saturating_sub(*since) as f64 / 10_000.0})).collect::<Vec<_>>(),
                "readyWaitTotalMs": thread.ready_total as f64 / 10_000.0,
                "readyWaitMaxMs": thread.ready_max as f64 / 10_000.0,
                "observedReadyDispatches": thread.dispatches,
                "readyWaitOver16ms": thread.slow_dispatches,
                "pendingReadyMsLowerBound": thread.ready_since.and_then(|at| end.checked_sub(at))
                    .map(|time| time as f64 / 10_000.0),
            })
        }).collect();
        json!({
            "threads": threads, "trackedThreads": sampled,
            "threadsTruncated": sampled > 12, "discontinuities": self.discontinuities,
            "openRunningSlices": self.running.values().filter(|(tid, _)| self.threads.contains_key(tid)).count(),
            "processorNonIdleScheduledMs": self.processor_since.iter().map(|(cpu, since)| json!({
                "processor": cpu, "class": self.classes.get(cpu),
                "coveredMs": end.saturating_sub(*since) as f64 / 10_000.0,
                "ms": (self.processor_busy.get(cpu).copied().unwrap_or(0)
                    + self.running.get(cpu).filter(|(tid, _)| *tid != 0)
                        .map(|(_, at)| end.saturating_sub(*at)).unwrap_or(0)) as f64 / 10_000.0
            })).collect::<Vec<_>>(),
            "trackedTransitions": self.tracked_transitions,
            "interruptTimeAccounted": false,
            "availableCpuCapacityKnown": false,
            "runtimeInterpretation": "scheduled-residency-includes-interrupts",
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model() -> SchedulerModel {
        SchedulerModel::new(
            vec![ThreadIdentity {
                pid: 9,
                tid: 10,
                role: "renderer-main",
            }],
            BTreeMap::from([(0, 0), (1, 8)]),
        )
    }

    #[test]
    fn decodes_only_known_complete_kernel_payloads() {
        let mut data = [0u8; 24];
        data[..4].copy_from_slice(&10u32.to_le_bytes());
        data[4..8].copy_from_slice(&99u32.to_le_bytes());
        data[14] = 1;
        assert!(matches!(
            decode(36, 2, &data),
            Some(Transition::Switch {
                incoming: 10,
                outgoing: 99,
                state: 1
            })
        ));
        assert!(matches!(
            decode(50, 2, &data[..8]),
            Some(Transition::Ready(10))
        ));
        data[6] = 2;
        assert!(matches!(
            decode(50, 2, &data[..8]),
            Some(Transition::SwappedOut(10))
        ));
        assert!(decode(36, 3, &data).is_none());
        assert!(decode(36, 2, &data[..23]).is_none());
        assert!(decode(50, 2, &data[..7]).is_none());
    }

    #[test]
    fn measures_actual_core_runtime_and_ready_wait_without_counting_blocked_time() {
        let mut model = model();
        model.ready(10, 10_000);
        model.ready(10, 20_000);
        model.switch(0, 210_000, 10, 99, 5);
        model.switch(0, 310_000, 99, 10, 5);
        // Blocked on IO for 1 second, then ready for 1ms on the faster class.
        model.ready(10, 10_310_000);
        model.switch(1, 10_320_000, 10, 99, 5);
        model.switch(1, 10_520_000, 99, 10, 1);
        let report = model.report(10_530_000);
        let thread = &report["threads"][0];
        assert_eq!(
            thread["runtimeByEfficiencyClassMs"],
            json!([
            {"class": 0, "ms": 10.0}, {"class": 8, "ms": 20.0}])
        );
        assert_eq!(thread["readyWaitTotalMs"], 21.0);
        assert_eq!(thread["readyWaitMaxMs"], 20.0);
        assert_eq!(thread["readyWaitOver16ms"], 1);
        assert_eq!(thread["pendingReadyMsLowerBound"], 1.0);
    }

    #[test]
    fn excludes_partial_intervals_and_marks_broken_event_sequences() {
        let mut model = model();
        model.switch(0, 10, 99, 10, 5);
        model.switch(0, 20, 10, 99, 5);
        model.switch(0, 30, 99, 88, 5);
        model.ready(10, 50);
        model.switch(0, 40, 10, 99, 5);
        let report = model.report(60);
        assert_eq!(report["discontinuities"], 2);
        assert_eq!(report["threads"][0]["observedReadyDispatches"], 0);
        assert_eq!(
            report["threads"][0]["runtimeByEfficiencyClassMs"],
            json!([])
        );
        assert_eq!(report["openRunningSlices"], 1);
    }

    #[test]
    fn preserves_stalled_named_threads_and_bounds_report_size() {
        let threads = (1..=1024)
            .map(|tid| ThreadIdentity {
                pid: 9,
                tid,
                role: if tid == 1024 {
                    "renderer-main"
                } else {
                    "other"
                },
            })
            .collect();
        let mut model = SchedulerModel::new(threads, BTreeMap::new());
        model.ready(1024, 1);
        let report = model.report(10_000_001);
        assert_eq!(report["threads"].as_array().unwrap().len(), 12);
        assert_eq!(report["threads"][0]["tid"], 1024);
        assert_eq!(report["threads"][0]["pendingReadyMsLowerBound"], 1000.0);
        assert_eq!(report["threadsTruncated"], true);
    }

    #[test]
    fn preempted_threads_wait_until_the_next_dispatch_and_unknown_cpus_stay_unknown() {
        let mut model = model();
        model.switch(0, 0, 10, 99, 5);
        model.switch(0, 10_000, 99, 10, 1);
        model.switch(3, 210_000, 10, 99, 5);
        model.switch(3, 310_000, 99, 10, 5);
        let report = model.report(400_000);
        let thread = &report["threads"][0];
        assert_eq!(thread["readyWaitTotalMs"], 20.0);
        assert_eq!(thread["unknownProcessorMs"], 10.0);
        assert_eq!(report["discontinuities"], 0);
    }

    #[test]
    fn processor_pressure_counts_other_work_without_logging_other_threads_or_idle_time() {
        let mut model = model();
        model.switch(1, 0, 999, 0, 5);
        model.switch(1, 100_000, 0, 999, 5);
        model.switch(1, 900_000, 888, 0, 5);
        model.switch(1, 1_000_000, 0, 888, 5);
        let report = model.report(1_000_000);
        assert_eq!(
            report["processorNonIdleScheduledMs"],
            json!([{"processor": 1, "class": 8, "coveredMs": 100.0, "ms": 20.0}])
        );
        assert_eq!(report["trackedTransitions"], 0);
        assert!(!report.to_string().contains("999"));
        assert!(!report.to_string().contains("888"));
    }

    #[test]
    fn swapped_out_stack_is_not_counted_as_scheduler_ready_wait() {
        let mut model = model();
        model.ready(10, 1);
        model.swapped_out(10);
        model.ready(10, 10_000_000);
        model.switch(0, 10_010_000, 10, 99, 5);
        let report = model.report(10_020_000);
        assert_eq!(report["threads"][0]["readyWaitTotalMs"], 1.0);
        assert_eq!(
            report["threads"][0]["runningAtWindowEnd"][0]["observedMsLowerBound"],
            1.0
        );
    }

    #[test]
    fn cross_cpu_ready_after_same_timestamp_dispatch_is_not_a_new_wait() {
        let mut model = model();
        model.switch(0, 1000, 10, 99, 5);
        model.ready(10, 1000);
        let report = model.report(10_001_000);
        assert!(report["threads"][0]["pendingReadyMsLowerBound"].is_null());
        assert_eq!(
            report["threads"][0]["runningAtWindowEnd"][0]["observedMsLowerBound"],
            1000.0
        );
        assert_eq!(report["discontinuities"], 0);
        model.ready(10, 1001);
        assert_eq!(
            model.discontinuities, 1,
            "contradictory states must invalidate evidence"
        );
    }

    #[test]
    fn busy_compositors_cannot_evict_pending_ready_renderer_or_ui() {
        let mut threads: Vec<_> = (1..=12)
            .map(|tid| ThreadIdentity {
                pid: 9,
                tid,
                role: "compositor",
            })
            .collect();
        threads.push(ThreadIdentity {
            pid: 9,
            tid: 99,
            role: "renderer-main",
        });
        threads.push(ThreadIdentity {
            pid: 9,
            tid: 100,
            role: "transterm-ui",
        });
        let mut model = SchedulerModel::new(threads, BTreeMap::from([(0, 0)]));
        model.ready(99, 0);
        for tid in 1..=12 {
            let at = u64::from(tid) * 20_000;
            model.switch(0, at, tid, 0, 5);
            model.switch(0, at + 10_000, 0, tid, 5);
        }
        let report = model.report(10_000_000);
        assert_eq!(report["threads"][0]["role"], "transterm-ui");
        assert_eq!(report["threads"][1]["role"], "renderer-main");
        assert_eq!(report["threads"][1]["pendingReadyMsLowerBound"], 1000.0);
        assert_eq!(report["threadsTruncated"], true);
        assert_eq!(report["availableCpuCapacityKnown"], false);
        assert_eq!(report["interruptTimeAccounted"], false);
        assert!(report.get("processorBusyMs").is_none());
    }
}
