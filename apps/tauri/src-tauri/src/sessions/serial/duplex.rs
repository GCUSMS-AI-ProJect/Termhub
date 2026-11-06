use std::{future::Future, io};

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite};
use tokio_util::sync::CancellationToken;

use super::pacing::{write_serial_bytes, SerialPacing};

pub(super) async fn write_while_receiving<R, W, F, O>(
    reader: &mut R,
    writer: &mut W,
    bytes: &[u8],
    cancellation: &CancellationToken,
    pacing: SerialPacing,
    mut receive: F,
) -> io::Result<bool>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
    F: FnMut(Vec<u8>) -> O,
    O: Future<Output = io::Result<()>>,
{
    let write = write_serial_bytes(writer, bytes, cancellation, pacing);
    tokio::pin!(write);
    let mut buffer = [0_u8; 4096];
    loop {
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => return Ok(false),
            result = &mut write => return result,
            read = reader.read(&mut buffer) => {
                let count = read?;
                if count == 0 {
                    return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "串口设备已断开"));
                }
                receive(buffer[..count].to_vec()).await?;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::io::{duplex, split, AsyncWriteExt};
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn blocked_send_keeps_receiving_and_cancels_without_waiting_for_peer() {
        let (serial, mut peer) = duplex(8);
        let (mut reader, mut writer) = split(serial);
        let cancellation = CancellationToken::new();
        let worker_cancellation = cancellation.clone();
        let (tx, mut rx) = mpsc::channel(4);
        let task = tokio::spawn(async move {
            write_while_receiving(
                &mut reader,
                &mut writer,
                &[0x41; 64],
                &worker_cancellation,
                SerialPacing {
                    char_delay: Duration::from_millis(25),
                    ..Default::default()
                },
                move |bytes| {
                    let tx = tx.clone();
                    async move {
                        tx.send(bytes).await.unwrap();
                        Ok(())
                    }
                },
            )
            .await
        });
        peer.write_all(b"status").await.unwrap();
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(1), rx.recv())
                .await
                .unwrap()
                .unwrap(),
            b"status"
        );
        assert!(
            !task.is_finished(),
            "the send should still be waiting for the peer"
        );
        cancellation.cancel();
        assert!(!tokio::time::timeout(Duration::from_secs(1), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap());
    }

    #[tokio::test]
    async fn eof_during_a_blocked_send_returns_instead_of_waiting_for_write_timeout() {
        let (mut writer, _peer) = duplex(1);
        let error = write_while_receiving(
            &mut tokio::io::empty(),
            &mut writer,
            b"long payload",
            &CancellationToken::new(),
            SerialPacing::default(),
            |_| async { Ok(()) },
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::UnexpectedEof);
    }
}
