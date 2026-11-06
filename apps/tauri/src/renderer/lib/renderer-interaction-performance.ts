/** Event Timing measures dispatch delay and time to the next paint, without input contents. */
export function observeInteractionPerformance() {
  let samples = 0
  let maxInputDelayMs = 0
  let maxDurationMs = 0
  const supported =
    typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('event')
  const observer = supported
    ? new PerformanceObserver((list) => {
        if (document.hidden) return
        for (const entry of list.getEntries()) {
          if (entry.name !== 'keydown' && entry.name !== 'click') continue
          const timing = entry as PerformanceEventTiming
          samples++
          maxInputDelayMs = Math.max(maxInputDelayMs, timing.processingStart - timing.startTime)
          maxDurationMs = Math.max(maxDurationMs, timing.duration)
        }
      })
    : null
  observer?.observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit)
  return {
    snapshot: () => ({
      supported,
      samples,
      maxInputDelayMs: supported ? Math.round(maxInputDelayMs) : undefined,
      maxDurationMs: supported ? Math.round(maxDurationMs) : undefined
    }),
    reset: () => {
      samples = maxInputDelayMs = maxDurationMs = 0
    },
    dispose: () => observer?.disconnect()
  }
}
