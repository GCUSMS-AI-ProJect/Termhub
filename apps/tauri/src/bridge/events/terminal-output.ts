import type { TerminalDataPayload } from '@transterm/core'

export type TerminalOutputDelivery = TerminalDataPayload & { deliveryId?: number; skippedBytesBefore?: number }
export type TerminalOutputListener = (payload: TerminalDataPayload) => void | Promise<void>

let readProgress: () => object | null = () => null

/** Snapshot of the current window subscription; no terminal contents are retained. */
export function getTerminalOutputProgress(): object | null {
  return readProgress()
}

/** Release native credit only after every matching terminal finishes parsing. */
export function createTerminalOutputDelivery(
  listeners: Set<TerminalOutputListener>,
  acknowledge: (deliveryId: number) => Promise<void>,
  diagnostic: (message: string) => void
) {
  let pendingCharacters = 0
  let pendingBatches = 0
  let lastReport = -Infinity
  let busySince = 0
  let lastParsedAt: number | undefined
  const progress = {
    receivedBatches: 0,
    parsedBatches: 0,
    acknowledgedBatches: 0,
    untrackedBatches: 0,
    parseFailures: 0,
    ackFailures: 0,
    lastReceivedDeliveryId: undefined as number | undefined,
    lastParsedDeliveryId: undefined as number | undefined,
    lastSuccessfulDeliveryId: undefined as number | undefined,
    lastAcknowledgedDeliveryId: undefined as number | undefined
  }
  const snapshot = () => ({
    ...progress,
    pendingCharacters,
    pendingBatches,
    pendingAcknowledgements:
      progress.parsedBatches - progress.acknowledgedBatches - progress.ackFailures - progress.untrackedBatches,
    busyForMs: pendingBatches ? Math.round(performance.now() - busySince) : 0,
    sinceLastParsedMs: lastParsedAt === undefined ? undefined : Math.round(performance.now() - lastParsedAt)
  })
  readProgress = snapshot
  return (payload: TerminalOutputDelivery) => {
    if (payload.skippedBytesBefore) {
      payload = {
        ...payload,
        chunk: `\x18\x1b[0m\r\n[transterm: window display skipped ${payload.skippedBytesBefore} bytes while busy; press Ctrl+L to redraw]\r\n${payload.chunk}`
      }
    }
    const started = performance.now()
    if (!pendingBatches) busySince = started
    progress.receivedBatches++
    progress.lastReceivedDeliveryId = payload.deliveryId
    pendingCharacters += payload.chunk.length
    pendingBatches++
    void Promise.allSettled([...listeners].map((listener) => Promise.resolve().then(() => listener(payload))))
      .then((results) => {
        const elapsedMs = performance.now() - started
        const failed = results.some((result) => result.status === 'rejected')
        const now = performance.now()
        lastParsedAt = now
        progress.parsedBatches++
        progress.lastParsedDeliveryId = payload.deliveryId
        if (failed) progress.parseFailures++
        else progress.lastSuccessfulDeliveryId = payload.deliveryId
        if ((failed || payload.skippedBytesBefore || elapsedMs >= 1000) && now - lastReport >= 30000) {
          lastReport = now
          diagnostic(
            JSON.stringify({
              event: 'terminal-output-parse',
              progress: snapshot(),
              elapsedMs: Math.round(elapsedMs),
              pendingCharacters,
              pendingBatches,
              listenerCount: listeners.size,
              failed,
              skippedBytesBefore: payload.skippedBytesBefore
            })
          )
        }
      })
      .finally(() => {
        pendingCharacters -= payload.chunk.length
        pendingBatches--
        const deliveryId = payload.deliveryId
        if (deliveryId === undefined) {
          // Legacy deliveries have no native credit to acknowledge.
          progress.untrackedBatches++
          return
        }
        return Promise.resolve()
          .then(() => acknowledge(deliveryId))
          .then(
            () => {
              progress.acknowledgedBatches++
              progress.lastAcknowledgedDeliveryId = payload.deliveryId
            },
            () => {
              progress.ackFailures++
            }
          )
      })
      .catch(() => undefined)
  }
}
