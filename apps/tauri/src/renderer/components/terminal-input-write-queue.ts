export type TerminalInputWriteFailureHandler = (error: unknown) => void

const MAX_PENDING_BYTES = 1024 * 1024
const MAX_PENDING_MESSAGES = 4096
const CONTROL_RESERVE_BYTES = 1024
const encoder = new TextEncoder()
let pendingBytes = 0
let pendingMessages = 0

/** Preserve key order across asynchronous Tauri invoke calls for one terminal. */
export function createTerminalInputWriteQueue(options: {
  getTabId(): string
  write(tabId: string, data: string): Promise<void> | undefined
  shouldStop?(): boolean
}) {
  let pending: Promise<void> = Promise.resolve()
  let disposed = false

  const write = (data: string, onFailure?: TerminalInputWriteFailureHandler) => {
    if (disposed || !data) {
      return Promise.resolve()
    }

    const control = data.length <= 16 && Array.from(data).every((character) => character.charCodeAt(0) < 0x20)
    const limit = MAX_PENDING_BYTES + (control ? CONTROL_RESERVE_BYTES : 0)
    const bytes = data.length > limit ? data.length : encoder.encode(data).length
    if (pendingBytes + bytes > limit || pendingMessages >= MAX_PENDING_MESSAGES + (control ? 16 : 0)) {
      try {
        onFailure?.(new Error('Terminal input backlog full; input was not sent'))
      } catch {
        // A reporting callback must not reject the queue.
      }
      return Promise.resolve()
    }
    // Capture the destination along with the input event so a later render
    // cannot redirect queued characters to a different tab.
    const tabId = options.getTabId()
    pendingBytes += bytes
    pendingMessages++
    const current = pending.then(async () => {
      try {
        if (disposed || options.shouldStop?.()) return
        await options.write(tabId, data)
      } catch (error) {
        try {
          onFailure?.(error)
        } catch {
          // A reporting callback must not leave the input queue rejected.
        }
      } finally {
        pendingBytes -= bytes
        pendingMessages--
      }
    })

    // Keep the queue usable if a callback itself fails, while returning the
    // current write promise to callers that need to observe completion.
    pending = current.catch(() => {})
    return current
  }

  return {
    write,
    dispose() {
      disposed = true
    }
  }
}
