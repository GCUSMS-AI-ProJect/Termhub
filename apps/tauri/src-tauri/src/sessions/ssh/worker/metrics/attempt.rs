impl MetricsRuntime {
    async fn run_enabled(&mut self, retry_rx: &mut mpsc::Receiver<()>) {
        while retry_rx.try_recv().is_ok() {}
        loop {
            if self.attempt_cancellation.is_cancelled() || self.handle.is_closed() {
                break;
            }
            // Held through this attempt's recovery so followers keep waiting.
            let Some(lease) = self.acquire_monitoring_lease().await else {
                break;
            };
            let prepared = self.prepare().await;
            let reason = match prepared {
                Ok(prepared) => {
                    self.started_at = tokio::time::Instant::now();
                    self.health.last_sample = None;
                    read_metrics_channel(self, prepared, retry_rx).await
                }
                Err(()) => "startup-failed",
            };
            if self.attempt_cancellation.is_cancelled() || self.handle.is_closed() {
                break;
            }
            if self.status.phase == "unsupported" || reason == "session-replaced" {
                break;
            }
            self.gap = true;
            self.health.interrupt();
            if self.status.reason.is_none() {
                self.status.reason = Some(reason.into());
            }
            let manual = reason == "manual-retry";
            if manual && self.status.attempt >= self.status.max_attempts {
                self.status.attempt = 0;
            }
            let immediate = manual || reason == "stalled-channel";
            if let Some(delay) = MetricsPolicy::retry_delay(self.status.attempt) {
                let delay = if immediate { Duration::ZERO } else { delay };
                self.status.phase = "waiting".into();
                self.status.next_retry_at = Some(metrics_now_ms() + delay.as_millis() as u64);
                if !self.publish(None).await {
                    break;
                }
                if !wait_for_metrics_retry(&self.attempt_cancellation, retry_rx, Some(delay)).await
                {
                    break;
                }
            } else {
                // A failed collector must let a healthy SSH peer take over.
                drop(lease);
                self.status.phase = "failed".into();
                self.status.next_retry_at = None;
                if !self.publish(None).await {
                    break;
                }
                if !wait_for_metrics_retry(&self.attempt_cancellation, retry_rx, None).await {
                    break;
                }
                self.status.attempt = 0;
            }
            self.status.attempt += 1;
            self.status.phase = "recovering".into();
            self.status.next_retry_at = None;
            self.status.reason = None;
            if !self.publish(None).await {
                break;
            }
            // Discard clicks accepted just before the busy state was published.
            while retry_rx.try_recv().is_ok() {}
        }
    }
}
