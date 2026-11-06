import type { Terminal } from '@xterm/xterm'

export type PinchGestureEvent = Event & { scale?: number }

/** WebView compositor wheels can target document instead of xterm's mouse/scroll handler. */
export function forwardRetargetedTerminalWheel(terminal: Terminal, event: WheelEvent) {
  const element = terminal.element
  if (!element) return false

  element.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      altKey: event.altKey,
      metaKey: event.metaKey,
      screenX: event.screenX,
      screenY: event.screenY,
      shiftKey: event.shiftKey
    })
  )
  return true
}
