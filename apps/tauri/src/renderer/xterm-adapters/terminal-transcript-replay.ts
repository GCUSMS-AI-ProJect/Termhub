export const TERMINAL_TRANSCRIPT_LIMIT = 200_000
const TERMINAL_TRANSCRIPT_RETAINED_THRESHOLD = TERMINAL_TRANSCRIPT_LIMIT - 20_000

export function trimTranscript(transcript: string) {
  // The native session buffer is intentionally trimmed before it reaches the
  // renderer. That means a 180k snapshot can already begin in the middle of a
  // CSI/OSC sequence even though it is below the renderer's 200k limit. When
  // replayed after a tab switch, xterm would then inherit a bogus parser/style
  // state and TUI applications could render as a mostly blank/black screen.
  // Start long snapshots at the next line/control boundary instead.
  const requestedStart =
    transcript.length > TERMINAL_TRANSCRIPT_LIMIT
      ? transcript.length - TERMINAL_TRANSCRIPT_LIMIT
      : transcript.length >= TERMINAL_TRANSCRIPT_RETAINED_THRESHOLD
        ? 0
        : -1
  if (requestedStart < 0) {
    return transcript
  }

  const safeStart = findTranscriptReplayBoundary(transcript, requestedStart)
  return transcript.slice(safeStart)
}

function findTranscriptReplayBoundary(value: string, requestedStart: number) {
  if (requestedStart < 0 || requestedStart >= value.length) {
    return Math.max(0, requestedStart)
  }

  // A native snapshot may already start in the middle of a control sequence.
  // Keep an existing escape/line boundary, but otherwise move forward to the
  // next one instead of replaying a partial CSI/OSC prefix.
  if (
    (requestedStart === 0 && value[0] === '\u001b') ||
    (requestedStart > 0 &&
      (value[requestedStart] === '\u001b' || value[requestedStart - 1] === '\n' || value[requestedStart - 1] === '\r'))
  ) {
    return requestedStart
  }

  const nextEscape = value.indexOf('\u001b', requestedStart)
  const nextLineFeed = value.indexOf('\n', requestedStart)
  const nextCarriageReturn = value.indexOf('\r', requestedStart)
  let safeStart = value.length

  if (nextEscape >= 0) {
    safeStart = Math.min(safeStart, nextEscape)
  }
  if (nextLineFeed >= 0) {
    safeStart = Math.min(safeStart, nextLineFeed + 1)
  }
  if (nextCarriageReturn >= 0) {
    safeStart = Math.min(safeStart, nextCarriageReturn + 1)
  }

  // A long transcript can contain one very long printable line. Keep the
  // original limit in that uncommon case rather than discarding the whole
  // snapshot when no parser-safe boundary exists.
  return safeStart < value.length ? safeStart : requestedStart
}
