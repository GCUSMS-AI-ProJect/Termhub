import {
  observeTerminalFontMetrics,
  registerTerminalBufferRenderRecovery
} from '../xterm-adapters/terminal-render-recovery'
import { getVimVisualSelection } from '../xterm-adapters/terminal-vim-selection'
import { readClipboardText, writeClipboardText } from '../app/app-utils'
import { trimHydratedTerminalChunk } from '../app/terminal-transcript'
import {
  decodeBase64Utf8,
  encodeBase64Utf8,
  isOsc52TargetSupported,
  localizeTerminalText,
  logTerminalClipboard,
  logTerminalRender,
  splitOscPayload,
  TERMINAL_RESIZE_PIXEL_EPSILON,
  TERMINAL_RESIZE_SETTLE_MS
} from './terminal-view-utils'
import type { TerminalLifecycleResizeHandlers, TerminalLifecycleRuntime } from './terminal-lifecycle-types'

export function registerTerminalOutputHandlers(runtime: TerminalLifecycleRuntime): TerminalLifecycleResizeHandlers {
  const {
    terminal,
    fitAddon,
    searchAddon,
    hostRef,
    isActiveRef,
    tabIdRef,
    renderedTranscriptRef,
    suppressHydratedChunksUntilRef,
    replayingTranscriptRef,
    lastSyncedSizeRef,
    lastObservedHostRectRef,
    isHorizontalResizeActiveRef,
    pendingResizeForceRef,
    pendingResizeFreezeColsRef,
    resizeTimerRef,
    resizeSettleTimerRef,
    preserveVisibleBufferRef,
    connectedRef,
    connectingRef,
    wasConnectedRef,
    isReconnectingRef,
    inputSendFailedRef,
    reconnectHintShownRef,
    activeTerminalTabIdRef,
    onStatusRef,
    onReconnectRef,
    closedMessageRef,
    reconnectHintRef,
    setHasSelection,
    setFindMatchCount,
    setActiveFindIndex,
    setFindMiss,
    shouldHydrateTranscript,
    replaceTerminalWithTranscript,
    appendRenderedTranscript,
    clearSearchDecorations,
    formatTerminalChunk,
    scheduleTerminalWrite,
    buildExitAlternateScreenSequence,
    snapshotTerminalBuffer,
    syncTerminalSize
  } = runtime
  const host = hostRef.current!

  const screenBufferRenderDisposable = registerTerminalBufferRenderRecovery(
    terminal,
    (previousBufferType, nextBufferType) => {
      logTerminalRender(terminal, 'screen-buffer-switched', {
        tabId: tabIdRef.current,
        previousBufferType,
        nextBufferType
      })
    }
  )

  const searchResultsDisposable = searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
    setFindMatchCount(resultCount)
    setActiveFindIndex(resultIndex)
    setFindMiss(resultCount === 0)
  })

  const osc52Disposable = terminal.parser.registerOscHandler(52, async (payload) => {
    const parsed = splitOscPayload(payload)
    if (!parsed || !isOsc52TargetSupported(parsed.target)) {
      return false
    }

    if (replayingTranscriptRef.current) {
      return true
    }

    if (parsed.data === '?') {
      let clipboardText = ''
      try {
        clipboardText = await readClipboardText()
      } catch {
        clipboardText = ''
      }
      const encoded = encodeBase64Utf8(clipboardText)
      await window.transterm?.writeTerminal(tabIdRef.current, `\u001b]52;${parsed.target || 'c'};${encoded}\u0007`)
      return true
    }

    const decoded = decodeBase64Utf8(parsed.data)
    if (decoded === null) {
      return false
    }

    await writeClipboardText(decoded)
    return true
  })

  syncTerminalSize(fitAddon, terminal)
  activeTerminalTabIdRef.current = tabIdRef.current

  const resize = (force = false, freezeCols = false, preserveVisibleBuffer = false) => {
    syncTerminalSize(fitAddon, terminal, { force, freezeCols, preserveVisibleBuffer })
  }
  const scheduleResize = (force = false, freezeCols = false, preserveVisibleBuffer = false) => {
    if (!isActiveRef.current) {
      return
    }
    pendingResizeForceRef.current = pendingResizeForceRef.current || force
    pendingResizeFreezeColsRef.current = pendingResizeFreezeColsRef.current || freezeCols

    if (resizeTimerRef.current !== null) {
      window.cancelAnimationFrame(resizeTimerRef.current)
    }

    resizeTimerRef.current = window.requestAnimationFrame(() => {
      resizeTimerRef.current = null
      const shouldForce = pendingResizeForceRef.current
      const shouldFreezeCols = pendingResizeFreezeColsRef.current
      pendingResizeForceRef.current = false
      pendingResizeFreezeColsRef.current = false
      resize(shouldForce, shouldFreezeCols, preserveVisibleBuffer)
    })
  }

  const disposeCanvasTextMetrics = observeTerminalFontMetrics(terminal, () => scheduleResize(true))

  const scheduleSettledHorizontalResize = () => {
    if (resizeSettleTimerRef.current !== null) {
      window.clearTimeout(resizeSettleTimerRef.current)
    }

    resizeSettleTimerRef.current = window.setTimeout(() => {
      resizeSettleTimerRef.current = null
      isHorizontalResizeActiveRef.current = false
      window.requestAnimationFrame(() => scheduleResize(true, false, true))
    }, TERMINAL_RESIZE_SETTLE_MS)
  }

  const resizeObserver = new ResizeObserver(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const { left, top, right, bottom, width, height } = host.getBoundingClientRect()
    const lastObservedRect = lastObservedHostRectRef.current
    lastObservedHostRectRef.current = { left, top, right, bottom, width, height }

    const hostBecameUsable =
      isActiveRef.current &&
      width > 0 &&
      height > 0 &&
      Boolean(!lastObservedRect || lastObservedRect.width <= 0 || lastObservedRect.height <= 0)
    if (hostBecameUsable) {
      // WebKitGTK/WKWebView can report the hidden keep-alive surface as
      // zero-sized first and a usable box only after the visibility change.
      // Rebuild the cached glyph atlas at that boundary instead of waiting
      // for another terminal write to make the missing canvas repaint.
      terminal.clearTextureAtlas()
      scheduleResize(true)
      window.requestAnimationFrame(() => {
        if (isActiveRef.current) {
          terminal.refresh(0, Math.max(terminal.rows - 1, 0))
        }
      })
      return
    }

    const widthChanged = Boolean(
      lastObservedRect && Math.abs(lastObservedRect.width - width) > TERMINAL_RESIZE_PIXEL_EPSILON
    )
    if (widthChanged) {
      isHorizontalResizeActiveRef.current = true
      scheduleResize(false, true)
      scheduleSettledHorizontalResize()
      return
    }
    if (isHorizontalResizeActiveRef.current) {
      scheduleResize(false, true)
      scheduleSettledHorizontalResize()
      return
    }

    scheduleResize()
  })
  resizeObserver.observe(host)

  const onWindowFocus = () => {
    window.requestAnimationFrame(() => scheduleResize(true))
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      window.requestAnimationFrame(() => scheduleResize(true))
    }
  }

  const registerSessionEvents = () => {
    const onSelectionDispose = terminal.onSelectionChange(() => {
      const nextHasSelection = terminal.hasSelection() || Boolean(getVimVisualSelection(terminal))
      setHasSelection(nextHasSelection)
      logTerminalClipboard(terminal, 'selection-changed', { nextHasSelection })
    })

    const offData = window.transterm?.onTerminalData(({ tabId: nextTabId, chunk }) => {
      if (nextTabId !== tabIdRef.current) {
        return
      }
      const shouldTrimHydratedBacklog = Date.now() < suppressHydratedChunksUntilRef.current
      if (shouldTrimHydratedBacklog) {
        // IPC ordering can leave one queued batch behind an authoritative
        // snapshot. Consume that single backlog opportunity; repeated fuzzy
        // trimming could eat legitimate repeated terminal output.
        suppressHydratedChunksUntilRef.current = 0
      }
      const visibleChunk = shouldTrimHydratedBacklog
        ? trimHydratedTerminalChunk(renderedTranscriptRef.current, chunk)
        : chunk
      if (!visibleChunk) {
        return
      }
      appendRenderedTranscript(visibleChunk)
      clearSearchDecorations()
      const parsed = scheduleTerminalWrite(formatTerminalChunk(terminal, visibleChunk))
      return parsed
    })

    const offState = window.transterm?.onTerminalState(
      ({ tabId: nextTabId, summary, transcript, connected, status }) => {
        if (nextTabId !== tabIdRef.current) {
          return
        }
        onStatusRef.current?.(localizeTerminalText(summary))
        connectedRef.current = connected
        connectingRef.current = status === 'connecting'
        const isDisconnecting = wasConnectedRef.current && !connected
        if (isDisconnecting) {
          preserveVisibleBufferRef.current = true
        }
        if (shouldHydrateTranscript(renderedTranscriptRef.current, transcript, connected)) {
          replaceTerminalWithTranscript(terminal, transcript)
        }
        if (!wasConnectedRef.current && connected) {
          lastSyncedSizeRef.current = null
          preserveVisibleBufferRef.current = false
          window.requestAnimationFrame(() => scheduleResize(true))
        }
        if (isDisconnecting) {
          terminal.write(buildExitAlternateScreenSequence(), () => {
            const visibleTranscript = snapshotTerminalBuffer(terminal)
            const reconnectHint = onReconnectRef.current ? `\r\n${reconnectHintRef.current}` : ''
            if (reconnectHint) {
              reconnectHintShownRef.current = true
            }
            const disconnectedTranscript = visibleTranscript
              ? `${visibleTranscript}\r\n${closedMessageRef.current}${reconnectHint}\r\n`
              : `${closedMessageRef.current}${reconnectHint}\r\n`
            replaceTerminalWithTranscript(terminal, disconnectedTranscript)
          })
        } else if (!connected && status === 'error') {
          // A reconnect command only starts the worker, so its Promise resolves
          // before a failed TCP/SSH handshake is known. The terminal state is
          // the authoritative failure signal for both initial and retry attempts.
          runtime.writeReconnectHint()
        }
        wasConnectedRef.current = connected
        if (connected) {
          isReconnectingRef.current = false
          inputSendFailedRef.current = false
          reconnectHintShownRef.current = false
        }
      }
    )

    return () => {
      onSelectionDispose.dispose()
      offData?.()
      offState?.()
    }
  }

  return {
    resize,
    scheduleResize,
    scheduleSettledHorizontalResize,
    onWindowFocus,
    onVisibilityChange,
    registerSessionEvents,
    dispose: () => {
      screenBufferRenderDisposable.dispose()
      searchResultsDisposable.dispose()
      osc52Disposable.dispose()
      disposeCanvasTextMetrics()
      resizeObserver.disconnect()
    }
  }
}
