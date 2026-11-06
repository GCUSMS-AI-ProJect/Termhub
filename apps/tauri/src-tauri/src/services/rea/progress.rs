use serde::Serialize;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReaPreparationStage {
    CheckingRuntime,
    PreparingPackage,
    Starting,
    CheckingEngines,
    Ready,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaPreparationProgress {
    pub request_id: String,
    pub stage: ReaPreparationStage,
}

pub type ProgressReporter = Option<Arc<dyn Fn(ReaPreparationStage) + Send + Sync>>;
pub fn report(reporter: &ProgressReporter, stage: ReaPreparationStage) {
    if let Some(reporter) = reporter {
        reporter(stage);
    }
}

#[derive(Default)]
pub struct StageDecoder {
    pending: Vec<u8>,
}
impl StageDecoder {
    pub fn push(&mut self, bytes: &[u8], reporter: &ProgressReporter) {
        for &byte in bytes {
            if byte == b'\n' {
                let line = String::from_utf8_lossy(&self.pending);
                let stage = match line.trim_end_matches('\r') {
                    "TERMHUB_REA_STAGE:checking-runtime" => {
                        Some(ReaPreparationStage::CheckingRuntime)
                    }
                    "TERMHUB_REA_STAGE:preparing-package" => {
                        Some(ReaPreparationStage::PreparingPackage)
                    }
                    "TERMHUB_REA_STAGE:starting" => Some(ReaPreparationStage::Starting),
                    _ => None,
                };
                if let Some(stage) = stage {
                    report(reporter, stage);
                }
                self.pending.clear();
            } else if self.pending.len() < 1024 {
                self.pending.push(byte);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stage_decoder_handles_fragmentation_and_ignores_raw_logs() {
        let stages = Arc::new(std::sync::Mutex::new(Vec::new()));
        let captured = stages.clone();
        let reporter: ProgressReporter =
            Some(Arc::new(move |stage| captured.lock().unwrap().push(stage)));
        let mut decoder = StageDecoder::default();
        decoder.push(b"private stderr\nTERMHUB_REA_STA", &reporter);
        decoder.push(
            b"GE:preparing-package\r\nTERMHUB_REA_STAGE:fake\n",
            &reporter,
        );
        decoder.push(b"TERMHUB_REA_STAGE:starting\n", &reporter);
        assert_eq!(
            *stages.lock().unwrap(),
            vec![
                ReaPreparationStage::PreparingPackage,
                ReaPreparationStage::Starting
            ]
        );
    }
}
