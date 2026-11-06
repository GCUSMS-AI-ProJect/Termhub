use std::time::Duration;

use tokio_serial::{SerialPortBuilder, SerialPortBuilderExt, SerialStream};
use tokio_util::sync::CancellationToken;

use super::control::{apply_close_lines, SerialControlState};

const SERIAL_OPEN_TIMEOUT: Duration = Duration::from_secs(15);

// A canceled blocking open can finish later; its result still owns line cleanup.
struct PendingSerialPort {
    stream: Option<SerialStream>,
    control: SerialControlState,
}

impl Drop for PendingSerialPort {
    fn drop(&mut self) {
        if let Some(stream) = self.stream.as_mut() {
            if let Err(error) = apply_close_lines(stream, self.control) {
                crate::services::logging::write_global(
                    "WARN",
                    "serial",
                    format!("late serial open cleanup failed: {error}"),
                );
            }
        }
    }
}

pub(super) async fn open_serial_port(
    builder: SerialPortBuilder,
    control: SerialControlState,
    cancellation: &CancellationToken,
) -> Result<SerialStream, String> {
    let runtime = tokio::runtime::Handle::current();
    let mut opened = wait_for_open(
        move || {
            let _entered = runtime.enter();
            builder
                .open_native_async()
                .map(|stream| PendingSerialPort {
                    stream: Some(stream),
                    control,
                })
                .map_err(|error| error.to_string())
        },
        cancellation,
        SERIAL_OPEN_TIMEOUT,
    )
    .await?;
    Ok(opened.stream.take().unwrap())
}

async fn wait_for_open<T: Send + 'static>(
    open: impl FnOnce() -> Result<T, String> + Send + 'static,
    cancellation: &CancellationToken,
    wait: Duration,
) -> Result<T, String> {
    if cancellation.is_cancelled() {
        return Err("串口打开已取消".to_string());
    }
    let mut task = tokio::task::spawn_blocking(open);
    let result = tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err("串口打开已取消".to_string()),
        result = tokio::time::timeout(wait, &mut task) => match result {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => Err(format!("串口打开任务失败：{error}")),
            Err(_) => Err("串口打开超时，请检查设备占用和驱动状态".to_string()),
        },
    };
    // abort only stops work that has not begun. Running opens release their late result on drop.
    if result.is_err() {
        task.abort();
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tokio::sync::oneshot;

    struct Opened(Arc<AtomicUsize>);
    impl Drop for Opened {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn timed_out_and_canceled_opens_release_late_handles_once() {
        for cancel in [false, true] {
            let released = Arc::new(AtomicUsize::new(0));
            let probe = released.clone();
            let cancellation = CancellationToken::new();
            let token = cancellation.clone();
            let (started, ready) = oneshot::channel();
            let (release, blocked) = std::sync::mpsc::channel();
            let task = tokio::spawn(async move {
                wait_for_open(
                    move || {
                        started.send(()).unwrap();
                        blocked.recv().unwrap();
                        Ok(Opened(probe))
                    },
                    &token,
                    if cancel {
                        Duration::from_secs(10)
                    } else {
                        Duration::from_millis(50)
                    },
                )
                .await
            });
            ready.await.unwrap();
            if cancel {
                cancellation.cancel();
            }
            let result = tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .unwrap()
                .unwrap();
            assert!(result
                .err()
                .unwrap()
                .contains(if cancel { "取消" } else { "超时" }));
            assert_eq!(released.load(Ordering::SeqCst), 0);
            release.send(()).unwrap();
            tokio::time::timeout(Duration::from_secs(1), async {
                while released.load(Ordering::SeqCst) == 0 {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            assert_eq!(released.load(Ordering::SeqCst), 1);
        }
    }

    #[tokio::test]
    async fn an_already_canceled_open_does_not_touch_the_device() {
        let cancellation = CancellationToken::new();
        cancellation.cancel();
        assert!(wait_for_open(
            || -> Result<(), String> { panic!("canceled open ran") },
            &cancellation,
            Duration::from_secs(1)
        )
        .await
        .unwrap_err()
        .contains("取消"));
    }
}
