use super::{OutputBatch, BATCH_BYTES};
use std::collections::{HashMap, VecDeque};

pub(super) const PENDING_BATCHES_PER_TAB: usize = 8;
// Bound both payload (2 MiB) and bookkeeping, even with many tiny streams.
pub(super) const PENDING_BATCHES: usize = 128;

#[derive(Default)]
pub(super) struct OutputQueue {
    pub(super) batches: VecDeque<OutputBatch>,
    pub(super) skipped_bytes: HashMap<String, usize>,
    pub(super) ready_tabs: VecDeque<String>,
}

impl OutputQueue {
    pub(super) fn enqueue(&mut self, tab_id: &str, chunk: &str) -> bool {
        // Only extend the latest batch for this tab, and never across a display gap.
        if !self.skipped_bytes.contains_key(tab_id) {
            if let Some(batch) = self
                .batches
                .iter_mut()
                .rev()
                .find(|batch| batch.tab_id == tab_id)
                .filter(|batch| batch.chunk.len() + chunk.len() <= BATCH_BYTES)
            {
                batch.chunk.push_str(chunk);
                return true;
            }
        }
        let tab_batches = self
            .batches
            .iter()
            .filter(|batch| batch.tab_id == tab_id)
            .count();
        if tab_batches >= PENDING_BATCHES_PER_TAB || self.batches.len() >= PENDING_BATCHES {
            let skipped = self.skipped_bytes.entry(tab_id.to_owned()).or_default();
            *skipped = skipped.saturating_add(chunk.len());
            return false;
        }
        if tab_batches == 0 {
            self.ready_tabs.push_back(tab_id.to_owned());
        }
        self.batches.push_back(OutputBatch {
            tab_id: tab_id.to_owned(),
            chunk: chunk.to_owned(),
            skipped_bytes_before: self.skipped_bytes.remove(tab_id).unwrap_or_default(),
        });
        true
    }

    pub(super) fn pop_next(&mut self) -> Option<OutputBatch> {
        let tab_id = self.ready_tabs.pop_front()?;
        let index = self
            .batches
            .iter()
            .position(|batch| batch.tab_id == tab_id)?;
        let batch = self.batches.remove(index)?;
        if self.batches.iter().any(|batch| batch.tab_id == tab_id) {
            self.ready_tabs.push_back(tab_id);
        }
        Some(batch)
    }

    pub(super) fn forget_tab(&mut self, tab_id: &str) {
        self.batches.retain(|batch| batch.tab_id != tab_id);
        self.ready_tabs.retain(|ready| ready != tab_id);
        self.skipped_bytes.remove(tab_id);
    }
}
