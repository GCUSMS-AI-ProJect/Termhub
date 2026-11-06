//! Keep input charged while it moves through ingress, setup and native writer queues.
use std::{ops::Deref, sync::Arc};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub(crate) const INPUT_BUSY: &str = "Terminal input backlog full; input was not sent";
const MAX_INPUT_BYTES: usize = 1024 * 1024;
const TOTAL_INPUT_BYTES: usize = 16 * MAX_INPUT_BYTES;
static INPUT_BUDGET: std::sync::LazyLock<Arc<Semaphore>> =
    std::sync::LazyLock::new(|| Arc::new(Semaphore::new(TOTAL_INPUT_BYTES)));
// Control bytes can still enter when ordinary pastes have consumed the budget.
static CONTROL_BUDGET: std::sync::LazyLock<Arc<Semaphore>> =
    std::sync::LazyLock::new(|| Arc::new(Semaphore::new(4096)));

pub struct TerminalInput<T> {
    pub(crate) data: T,
    permits: Vec<OwnedSemaphorePermit>,
}

impl TerminalInput<String> {
    pub(crate) fn try_new(data: String) -> Result<Self, &'static str> {
        Self::with_budget(data, &INPUT_BUDGET, &CONTROL_BUDGET)
    }

    fn with_budget(
        data: String,
        budget: &Arc<Semaphore>,
        control_budget: &Arc<Semaphore>,
    ) -> Result<Self, &'static str> {
        if data.len() > MAX_INPUT_BYTES {
            return Err(INPUT_BUSY);
        }
        // Charge small messages too, so empty strings/key bursts cannot grow queue metadata forever.
        let cost = data.len().max(64) as u32;
        let permit = Arc::clone(budget)
            .try_acquire_many_owned(cost)
            .or_else(|error| {
                if !data.is_empty() && data.len() <= 16 && data.bytes().all(|byte| byte < 0x20) {
                    Arc::clone(control_budget).try_acquire_many_owned(cost)
                } else {
                    Err(error)
                }
            })
            .map_err(|_| INPUT_BUSY)?;
        Ok(Self {
            data,
            permits: vec![permit],
        })
    }

    pub(crate) fn into_bytes(self) -> TerminalInput<Vec<u8>> {
        TerminalInput {
            data: self.data.into_bytes(),
            permits: self.permits,
        }
    }

    pub(crate) fn append(&mut self, next: Self) {
        self.data.push_str(&next.data);
        self.permits.extend(next.permits);
    }
}

impl TerminalInput<Vec<u8>> {
    pub(crate) fn append(&mut self, next: Self) {
        self.data.extend(next.data);
        self.permits.extend(next.permits);
    }
}

// Internal shell setup is bounded by the application, rather than external input.
impl From<Vec<u8>> for TerminalInput<Vec<u8>> {
    fn from(data: Vec<u8>) -> Self {
        Self {
            data,
            permits: Vec::new(),
        }
    }
}

impl<T> Deref for TerminalInput<T> {
    type Target = T;
    fn deref(&self) -> &T {
        &self.data
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn budget_follows_input_across_merge_and_conversion_and_releases_on_drop() {
        let budget = Arc::new(Semaphore::new(128));
        let controls = Arc::new(Semaphore::new(64));
        let mut input = TerminalInput::with_budget("中".into(), &budget, &controls).unwrap();
        input.append(TerminalInput::with_budget("\r".into(), &budget, &controls).unwrap());
        assert!(TerminalInput::with_budget("x".into(), &budget, &controls).is_err());
        let bytes = input.into_bytes();
        assert_eq!(bytes.data, "中\r".as_bytes());
        assert_eq!(budget.available_permits(), 0);
        let interrupt = TerminalInput::with_budget("\x03".into(), &budget, &controls).unwrap();
        assert!(TerminalInput::with_budget("\x03".into(), &budget, &controls).is_err());
        drop(interrupt);
        assert_eq!(controls.available_permits(), 64);
        drop(bytes);
        assert_eq!(budget.available_permits(), 128);
    }

    #[test]
    fn disconnect_releases_queued_input_and_utf8_is_charged_in_bytes() {
        let budget = Arc::new(Semaphore::new(300));
        let controls = Arc::new(Semaphore::new(64));
        let input = TerminalInput::with_budget("中".repeat(100), &budget, &controls).unwrap();
        let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        assert!(sender.send(input.into_bytes()).is_ok());
        assert_eq!(budget.available_permits(), 0);
        drop(receiver);
        assert_eq!(budget.available_permits(), 300);
        let input = TerminalInput::with_budget("retry".into(), &budget, &controls).unwrap();
        assert!(sender.send(input.into_bytes()).is_err());
        assert_eq!(budget.available_permits(), 300);
    }

    #[test]
    fn oversized_paste_is_rejected_whole_without_consuming_budget() {
        let budget = Arc::new(Semaphore::new(TOTAL_INPUT_BYTES));
        let controls = Arc::new(Semaphore::new(64));
        assert!(
            TerminalInput::with_budget("x".repeat(MAX_INPUT_BYTES + 1), &budget, &controls)
                .is_err()
        );
        assert_eq!(budget.available_permits(), TOTAL_INPUT_BYTES);
    }
}
