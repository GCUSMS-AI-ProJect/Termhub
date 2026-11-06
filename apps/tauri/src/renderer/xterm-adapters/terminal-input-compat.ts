import type { TerminalLifecycleRuntime } from '../components/terminal-lifecycle-types'

// Some IMEs can emit the committed composition once through xterm's normal
// input path and then emit the same text again when the user switches back to
// an ASCII keyboard layout. Keep this window narrow so this is not a general
// purpose input de-duplicator for fast, intentional typing.
export const TERMINAL_IME_DUPLICATE_WINDOW_MS = 75

/**
 * WebKit can drop the first Shift+number keydown in xterm's hidden textarea
 * input path when the next key arrives before the browser finishes the prior
 * composition/layout update. Keep the workaround limited to the number row:
 * ordinary letters, IME input, and modifier shortcuts must remain owned by
 * xterm and the browser.
 */
const US_SHIFTED_DIGITS: Readonly<Record<string, string>> = {
  Digit0: ')',
  Digit1: '!',
  Digit2: '@',
  Digit3: '#',
  Digit4: '$',
  Digit5: '%',
  Digit6: '^',
  Digit7: '&',
  Digit8: '*',
  Digit9: '('
}

const SHIFTED_TERMINAL_INPUT_CHARACTERS = new Set('!@#$%^&*()¥"')

export function isShiftedTerminalInputData(value: string | null) {
  return Boolean(value) && [...(value ?? '')].every((character) => SHIFTED_TERMINAL_INPUT_CHARACTERS.has(character))
}

export function getShiftedTerminalInput(event: KeyboardEvent) {
  if (
    !event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    event.key === 'Dead' ||
    event.key === 'Process' ||
    !/^Digit[0-9]$/.test(event.code)
  ) {
    return null
  }

  // `key` is the layout-resolved character on supported WebKit builds. The
  // fallback only applies when WebKit reports the unshifted digit instead.
  if (event.key.length === 1 && !/^[0-9]$/.test(event.key)) {
    return event.key
  }

  // A 229/Unidentified key is resolved by the following input event. Do not
  // guess a US layout character here; the committed input event has the
  // correct character for layouts such as macOS Chinese/Japanese keyboards.
  if (event.keyCode === 229) {
    return null
  }

  return US_SHIFTED_DIGITS[event.code] ?? null
}

type PendingTerminalInputEvent = {
  event: InputEvent
  data: string
  xtermEmitted: boolean
  kind: 'shifted' | 'committed'
  beforeKeydown: boolean
}

type TerminalKeydownRecord = {
  data: string
  at: number
  xtermEmitted: boolean
}

type TerminalInputCompatibilityOptions = Pick<
  TerminalLifecycleRuntime,
  | 'terminalTextarea'
  | 'isActiveRef'
  | 'connectedRef'
  | 'serialTransferBusyRef'
  | 'imeCompositionActiveRef'
  | 'imeCompositionTextRef'
  | 'imeCompositionEndedAtRef'
  | 'imeCompositionDataForwardedRef'
  | 'clearEphemeralHighlight'
  | 'setContextMenu'
  | 'writeTerminalInput'
>

export function createTerminalInputCompatibility(options: TerminalInputCompatibilityOptions) {
  const {
    terminalTextarea,
    isActiveRef,
    connectedRef,
    serialTransferBusyRef,
    imeCompositionActiveRef,
    imeCompositionTextRef,
    imeCompositionEndedAtRef,
    imeCompositionDataForwardedRef,
    clearEphemeralHighlight,
    setContextMenu,
    writeTerminalInput
  } = options

  const onCompositionStart = () => {
    imeCompositionActiveRef.current = true
    imeCompositionTextRef.current = ''
    imeCompositionEndedAtRef.current = 0
    imeCompositionDataForwardedRef.current = false
  }
  const onCompositionUpdate = (event: CompositionEvent) => {
    imeCompositionTextRef.current = event.data
  }
  const onCompositionEnd = (event: CompositionEvent) => {
    imeCompositionActiveRef.current = false
    // xterm also avoids relying on CompositionEvent.data because browsers
    // may report only the last candidate fragment there. The latest update
    // is the better signal; event.data is only a fallback for IMEs that do
    // not emit compositionupdate.
    const compositionText = imeCompositionTextRef.current || event.data
    imeCompositionTextRef.current = compositionText
    imeCompositionEndedAtRef.current = compositionText ? Date.now() : 0
    imeCompositionDataForwardedRef.current = false
  }
  terminalTextarea?.addEventListener('compositionstart', onCompositionStart)
  terminalTextarea?.addEventListener('compositionupdate', onCompositionUpdate)
  terminalTextarea?.addEventListener('compositionend', onCompositionEnd)

  let suppressShiftedTerminalKeypress = false
  let shiftedTerminalInputSent = false
  let activeShiftedTerminalInputCode: string | null = null
  let lastCommittedShiftedInput: { data: string; at: number } | null = null
  let pendingTerminalInputEvent: PendingTerminalInputEvent | null = null
  const recentTerminalKeydowns: TerminalKeydownRecord[] = []
  const suppressedTerminalKeydowns: Array<{ data: string; at: number }> = []
  const TERMINAL_INPUT_EVENT_WINDOW_MS = 250

  const pruneTerminalInputEvents = (now = Date.now()) => {
    const cutoff = now - TERMINAL_INPUT_EVENT_WINDOW_MS
    while (recentTerminalKeydowns.length > 0 && recentTerminalKeydowns[0].at < cutoff) {
      recentTerminalKeydowns.shift()
    }
    while (suppressedTerminalKeydowns.length > 0 && suppressedTerminalKeydowns[0].at < cutoff) {
      suppressedTerminalKeydowns.shift()
    }
  }
  const getPrintableTerminalKey = (event: KeyboardEvent) => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing ||
      event.key === 'Dead' ||
      event.key === 'Process' ||
      event.key === 'Unidentified' ||
      [...event.key].length !== 1
    ) {
      return null
    }
    const codePoint = event.key.codePointAt(0) ?? 0
    return codePoint >= 0x20 && codePoint !== 0x7f ? event.key : null
  }
  const rememberTerminalKeydown = (event: KeyboardEvent) => {
    const data = getPrintableTerminalKey(event)
    if (!data) {
      return
    }
    const now = Date.now()
    pruneTerminalInputEvents(now)
    recentTerminalKeydowns.push({ data, at: now, xtermEmitted: false })
  }
  const markTerminalKeydownEmitted = (data: string) => {
    const now = Date.now()
    pruneTerminalInputEvents(now)
    const record = recentTerminalKeydowns.find(
      (candidate) =>
        candidate.data === data && !candidate.xtermEmitted && now - candidate.at <= TERMINAL_INPUT_EVENT_WINDOW_MS
    )
    if (record) {
      record.xtermEmitted = true
    }
  }
  const takeMatchingTerminalKeydown = (data: string) => {
    const now = Date.now()
    pruneTerminalInputEvents(now)
    const index = recentTerminalKeydowns.findIndex(
      (candidate) => candidate.data === data && now - candidate.at <= TERMINAL_INPUT_EVENT_WINDOW_MS
    )
    return index >= 0 ? recentTerminalKeydowns.splice(index, 1)[0] : null
  }
  const consumeSuppressedTerminalKeydown = (data: string) => {
    const now = Date.now()
    pruneTerminalInputEvents(now)
    const index = suppressedTerminalKeydowns.findIndex(
      (candidate) => candidate.data === data && now - candidate.at <= TERMINAL_INPUT_EVENT_WINDOW_MS
    )
    if (index < 0) {
      return false
    }
    suppressedTerminalKeydowns.splice(index, 1)
    return true
  }
  const resetShiftedTerminalInputState = () => {
    shiftedTerminalInputSent = false
    activeShiftedTerminalInputCode = null
    lastCommittedShiftedInput = null
    suppressShiftedTerminalKeypress = false
  }
  const resetInputState = () => {
    resetShiftedTerminalInputState()
    pendingTerminalInputEvent = null
    recentTerminalKeydowns.length = 0
    suppressedTerminalKeydowns.length = 0
  }

  const handleKeyEvent = (event: KeyboardEvent): boolean | null => {
    if (event.type === 'keypress') {
      if (!suppressShiftedTerminalKeypress) {
        return true
      }

      // Some WebKit builds still dispatch keypress after a canceled
      // keydown. The character was already sent by the compatibility path;
      // suppress this legacy xterm route to avoid a duplicate byte.
      suppressShiftedTerminalKeypress = false
      event.preventDefault()
      event.stopPropagation()
      return false
    }

    if (event.type !== 'keydown') {
      return true
    }

    // If WebKit drops the previous keyup, a normal number-row keydown is a
    // safe boundary for the Shift-symbol compatibility state. Without this
    // fallback, a later 4/5/6 can inherit the previous symbol's one-shot
    // suppression flag and appear to be swallowed.
    if (!event.shiftKey && /^Digit[0-9]$/.test(event.code)) {
      resetShiftedTerminalInputState()
    }

    if (!shiftedTerminalInputSent) {
      suppressShiftedTerminalKeypress = false
    }

    const shiftedTerminalInput = getShiftedTerminalInput(event)
    if (shiftedTerminalInput && connectedRef.current) {
      const hasRecentMatchingInput =
        lastCommittedShiftedInput !== null &&
        lastCommittedShiftedInput.data === shiftedTerminalInput &&
        Date.now() - lastCommittedShiftedInput.at <= 100
      const isNewPhysicalKey = event.repeat || activeShiftedTerminalInputCode !== event.code
      if (isNewPhysicalKey && !hasRecentMatchingInput) {
        shiftedTerminalInputSent = false
        suppressShiftedTerminalKeypress = false
      }
      activeShiftedTerminalInputCode = event.code
      lastCommittedShiftedInput = null

      // WebKit can lose the first Shift+number character in xterm's hidden
      // textarea path when the next key arrives quickly. Send the resolved
      // character through the same PTY boundary while preventing xterm from
      // processing this key a second time.
      event.preventDefault()
      event.stopPropagation()
      suppressShiftedTerminalKeypress = true
      if (!shiftedTerminalInputSent) {
        clearEphemeralHighlight()
        setContextMenu(null)
        writeTerminalInput(shiftedTerminalInput)
        shiftedTerminalInputSent = true
      }
      return false
    }

    const printableTerminalKey = getPrintableTerminalKey(event)
    if (printableTerminalKey && !isShiftedTerminalInputData(printableTerminalKey)) {
      if (consumeSuppressedTerminalKeydown(printableTerminalKey)) {
        // The platform already committed this character through the input
        // event before delivering keydown. Do not let xterm replay it via
        // evaluateKeyboardEvent or CompositionHelper.
        event.preventDefault()
        event.stopPropagation()
        return false
      }
      rememberTerminalKeydown(event)
    }

    // Let xterm's CompositionHelper receive IME key events. In particular,
    // keyCode 229 / Process events must not be mistaken for reconnect or
    // terminal shortcuts while a composition is being finalized.
    if (imeCompositionActiveRef.current || event.isComposing || event.keyCode === 229 || event.key === 'Process') {
      return true
    }

    return null
  }

  const markDataEmitted = (data: string) => {
    markTerminalKeydownEmitted(data)
    if (pendingTerminalInputEvent && data === pendingTerminalInputEvent.data) {
      // The xterm input listener runs before our post-input listener. This
      // marker lets the bridge distinguish a character xterm already
      // committed from one that needs to be forwarded by transterm.
      pendingTerminalInputEvent.xtermEmitted = true
    }
  }

  const filterCompositionData = (data: string): string | null => {
    const isStandaloneNumericInputDuringIme = /^[0-9]+$/.test(data) && imeCompositionTextRef.current.length === 0
    if (imeCompositionActiveRef.current && !isStandaloneNumericInputDuringIme) {
      // Intermediate composition text is owned by the IME and must never
      // reach the remote PTY before compositionend. A digit with no active
      // composition text is different: macOS Chinese IMEs can route a
      // standalone number through the composition/keyCode=229 path.
      return null
    }

    const compositionText = imeCompositionTextRef.current
    const compositionEndedAt = imeCompositionEndedAtRef.current
    const isWithinCompositionWindow =
      compositionText.length > 0 && Date.now() - compositionEndedAt <= TERMINAL_IME_DUPLICATE_WINDOW_MS
    if (isWithinCompositionWindow && data === ' ') {
      // Switching from a Chinese IME back to an ASCII layout can leave the
      // candidate-confirmation space as a standalone xterm data event.
      return null
    }
    const isAsciiCompositionPayload = /^[\x20-\x7e]*$/.test(compositionText) && /^[\x20-\x7e]*$/.test(data)
    const compositionTextWithoutSpaces = compositionText.replaceAll(' ', '')
    const dataWithoutSpaces = data.replaceAll(' ', '')
    const duplicatedCompositionText = `${compositionTextWithoutSpaces}${compositionTextWithoutSpaces}`
    const isCompositionPayload =
      isWithinCompositionWindow &&
      compositionTextWithoutSpaces.length > 0 &&
      (dataWithoutSpaces === compositionTextWithoutSpaces || dataWithoutSpaces === duplicatedCompositionText)
    if (isCompositionPayload) {
      if (imeCompositionDataForwardedRef.current) {
        return null
      }
      imeCompositionDataForwardedRef.current = true
      data = dataWithoutSpaces === duplicatedCompositionText ? compositionTextWithoutSpaces : dataWithoutSpaces
    } else if (
      isWithinCompositionWindow &&
      isAsciiCompositionPayload &&
      data.includes(' ') &&
      compositionTextWithoutSpaces.length > 0 &&
      data.length <= compositionText.length + 4 &&
      (dataWithoutSpaces.includes(compositionTextWithoutSpaces) ||
        compositionTextWithoutSpaces.includes(dataWithoutSpaces))
    ) {
      // The same transition may put the confirmation space inside the
      // payload (`W n`) instead of emitting it separately. Remove all spaces.
      data = dataWithoutSpaces
      if (!data) {
        return null
      }
    }

    return data
  }

  const onTerminalInputCapture = (event: Event) => {
    if (event.target !== terminalTextarea) {
      return
    }
    if (!isActiveRef.current) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (terminalTextarea) {
        terminalTextarea.value = ''
      }
      return
    }

    const inputEvent = event as InputEvent
    const data = inputEvent.data ?? ''
    if (inputEvent.inputType !== 'insertText' || !data) {
      return
    }

    const isShiftedInput =
      isShiftedTerminalInputData(data) && !inputEvent.isComposing && !imeCompositionActiveRef.current
    const isStandaloneNumericImeInput =
      /^[0-9]+$/.test(data) &&
      imeCompositionTextRef.current.length === 0 &&
      (imeCompositionActiveRef.current || inputEvent.isComposing)
    const isWithinCompositionWindow =
      imeCompositionTextRef.current.length > 0 &&
      Date.now() - imeCompositionEndedAtRef.current <= TERMINAL_IME_DUPLICATE_WINDOW_MS
    const isActualCompositionInput =
      (inputEvent.isComposing || imeCompositionActiveRef.current) && !isStandaloneNumericImeInput
    const isCommittedAsciiInput = /^[\x20-\x7e]+$/.test(data) && !isActualCompositionInput && !isWithinCompositionWindow
    if (!isShiftedInput && !isCommittedAsciiInput) {
      return
    }

    const keydownRecord = isShiftedInput ? null : takeMatchingTerminalKeydown(data)
    if (keydownRecord?.xtermEmitted) {
      // The normal keydown path already emitted this character. Prevent the
      // platform input event from entering xterm a second time.
      event.preventDefault()
      event.stopImmediatePropagation()
      if (terminalTextarea) {
        terminalTextarea.value = ''
      }
      return
    }
    pendingTerminalInputEvent = {
      event: inputEvent,
      data,
      xtermEmitted: false,
      kind: isShiftedInput ? 'shifted' : 'committed',
      beforeKeydown: !keydownRecord
    }
    if (isShiftedInput && shiftedTerminalInputSent) {
      // The keydown path already committed this character. Stop xterm's
      // input listener before it can emit a second copy.
      event.preventDefault()
      event.stopImmediatePropagation()
      pendingTerminalInputEvent = null
      if (terminalTextarea) {
        terminalTextarea.value = ''
      }
    }
  }

  const onTerminalInputAfterXterm = (event: Event) => {
    if (!isActiveRef.current) {
      pendingTerminalInputEvent = null
      if (terminalTextarea) {
        terminalTextarea.value = ''
      }
      return
    }
    const inputEvent = event as InputEvent
    if (pendingTerminalInputEvent?.event !== inputEvent) {
      return
    }

    const committedInput = pendingTerminalInputEvent
    pendingTerminalInputEvent = null
    // xterm's CompositionHelper keeps a deferred snapshot of this textarea.
    // Clear the committed character after xterm has observed it.
    if (terminalTextarea) {
      terminalTextarea.value = ''
    }

    if (committedInput.kind === 'shifted' && committedInput.xtermEmitted) {
      shiftedTerminalInputSent = true
      activeShiftedTerminalInputCode = null
      lastCommittedShiftedInput = { data: committedInput.data, at: Date.now() }
      suppressShiftedTerminalKeypress = true
      return
    }
    if (committedInput.kind === 'shifted' && shiftedTerminalInputSent) {
      return
    }
    if (committedInput.kind === 'committed' && committedInput.beforeKeydown) {
      const now = Date.now()
      pruneTerminalInputEvents(now)
      suppressedTerminalKeydowns.push({ data: committedInput.data, at: now })
    }
    if (committedInput.xtermEmitted || !connectedRef.current || serialTransferBusyRef.current) {
      return
    }

    clearEphemeralHighlight()
    setContextMenu(null)
    writeTerminalInput(committedInput.data)
    if (committedInput.kind === 'shifted') {
      shiftedTerminalInputSent = true
      activeShiftedTerminalInputCode = null
      lastCommittedShiftedInput = { data: committedInput.data, at: Date.now() }
      suppressShiftedTerminalKeypress = true
    }
  }

  window.addEventListener('input', onTerminalInputCapture, true)
  terminalTextarea?.addEventListener('input', onTerminalInputAfterXterm, true)

  return {
    handleKeyEvent,
    markDataEmitted,
    filterCompositionData,
    onTerminalInputCapture,
    onTerminalInputAfterXterm,
    resetInputState,
    dispose: () => {
      terminalTextarea?.removeEventListener('compositionstart', onCompositionStart)
      terminalTextarea?.removeEventListener('compositionupdate', onCompositionUpdate)
      terminalTextarea?.removeEventListener('compositionend', onCompositionEnd)
      window.removeEventListener('input', onTerminalInputCapture, true)
      terminalTextarea?.removeEventListener('input', onTerminalInputAfterXterm, true)
      resetInputState()
    }
  }
}
