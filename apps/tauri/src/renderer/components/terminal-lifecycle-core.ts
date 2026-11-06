import { getTerminalCompatibilityOptions } from '../xterm-adapters/terminal-options'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { TerminalZoomOperation } from '@transterm/core'
import { isClinkAutosuggestHelpUrl } from '../app/terminal-transcript'
import { registerTerminalEmojiWidths } from '../xterm-adapters/terminal-emoji-widths'
import { t } from '../i18n'
import { getConfiguredMonoFontFamily } from '../app/font-metrics'
import { getTerminalLogColorPalette, TerminalLogColorizer } from '../xterm-adapters/terminal-log-colorizer'
import { registerTerminalForegroundAdapter } from '../xterm-adapters/terminal-foreground-adapter'
import { registerTerminalRenderCacheLimits } from '../xterm-adapters/terminal-render-cache'
import { scaleTerminalFontSizeForUiZoom } from '../app/ui-zoom'
import {
  getTerminalFontSize,
  setTerminalFontSize,
  TERMINAL_DEFAULT_FONT_SIZE,
  TERMINAL_MIN_FONT_SIZE,
  TERMINAL_MAX_FONT_SIZE
} from '../app/terminal-font-size-store'
import { logTerminalZoom } from './terminal-view-utils'
import { registerTerminalBlockGlyphRenderer } from '../xterm-adapters/terminal-block-glyph-renderer'
import { registerTerminalSelectionRenderer } from '../xterm-adapters/terminal-selection-renderer'
import { registerTerminalSymbolGlyphRenderer } from '../xterm-adapters/terminal-symbol-glyph-renderer'
import { createTerminalInputWriteQueue } from './terminal-input-write-queue'
import type { TerminalLifecycleOptions, TerminalLifecycleRuntime } from './terminal-lifecycle-types'

let lastFocusedTerminal: Terminal | null = null
let terminalUnderPointer: Terminal | null = null

export function clearTerminalGlobalState(terminal: Terminal) {
  if (lastFocusedTerminal === terminal) {
    lastFocusedTerminal = null
  }
  if (terminalUnderPointer === terminal) {
    terminalUnderPointer = null
  }
}

export function createTerminalLifecycleRuntime(options: TerminalLifecycleOptions): TerminalLifecycleRuntime | null {
  const host = options.hostRef.current
  if (!host) {
    return null
  }

  const { isMac, isWindowsPty } = options
  const terminal = new Terminal({
    ...getTerminalCompatibilityOptions(isWindowsPty),
    fontFamily: getConfiguredMonoFontFamily(),
    fontSize: scaleTerminalFontSizeForUiZoom(getTerminalFontSize(options.profileIdRef.current)),
    lineHeight: 1.05,
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    allowProposedApi: true,
    allowTransparency: true,
    scrollback: 6000,
    overviewRuler: { width: 0 },
    linkHandler: {
      activate: (_event, uri) => {
        if (!isClinkAutosuggestHelpUrl(uri)) {
          void window.transterm?.openExternalUrl(uri)
        }
      }
    },
    theme: options.buildTerminalTheme()
  })
  const fitAddon = new FitAddon()
  options.fitAddonRef.current = fitAddon
  const searchAddon = new SearchAddon({ highlightLimit: 2000 })
  const unicode11Addon = new Unicode11Addon()
  const webLinksAddon = new WebLinksAddon((_event, uri) => {
    if (!isClinkAutosuggestHelpUrl(uri)) {
      void window.transterm?.openExternalUrl(uri)
    }
  })
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(searchAddon)
  terminal.loadAddon(unicode11Addon)
  terminal.loadAddon(webLinksAddon)
  terminal.unicode.activeVersion = '11'
  const emojiWidths = registerTerminalEmojiWidths(terminal)
  terminal.open(host)
  const renderCacheLimits = registerTerminalRenderCacheLimits(terminal)
  const selectionRenderer = registerTerminalSelectionRenderer(terminal)
  const symbolGlyphRenderer = registerTerminalSymbolGlyphRenderer(terminal)
  const blockGlyphRenderer = registerTerminalBlockGlyphRenderer(terminal)
  options.terminalRef.current = terminal
  options.searchAddonRef.current = searchAddon
  const foregroundAdapter = registerTerminalForegroundAdapter(terminal)
  const terminalLogColorizer = new TerminalLogColorizer(terminal, getTerminalLogColorPalette(terminal.options.theme))
  options.terminalLogColorizerRef.current = terminalLogColorizer
  const xtermScrollableElement = host.querySelector('.xterm-scrollable-element') as HTMLElement | null
  options.setTerminalScrollableElement(xtermScrollableElement ?? terminal.element ?? null)
  const terminalTextarea = terminal.textarea

  const adjustTerminalFontSize = (change: number) => {
    if (options.terminalZoomLockedRef.current) {
      logTerminalZoom(terminal, 'font-size-ignored-locked', { change, tabId: options.tabIdRef.current })
      return false
    }

    const currentSize = getTerminalFontSize(options.profileIdRef.current)
    const nextSize = Math.max(TERMINAL_MIN_FONT_SIZE, Math.min(TERMINAL_MAX_FONT_SIZE, currentSize + change))
    logTerminalZoom(terminal, 'font-size-requested', {
      change,
      currentSize,
      nextSize,
      tabId: options.tabIdRef.current
    })
    if (nextSize === currentSize) {
      logTerminalZoom(terminal, 'font-size-unchanged-at-boundary', { tabId: options.tabIdRef.current })
      return false
    }

    setTerminalFontSize(options.profileIdRef.current, nextSize)
    options.applyTerminalFontSize(nextSize)
    logTerminalZoom(terminal, 'font-size-applied', {
      currentSize,
      nextSize: terminal.options.fontSize,
      cols: terminal.cols,
      rows: terminal.rows,
      tabId: options.tabIdRef.current
    })
    return true
  }
  const resetTerminalFontSize = () =>
    adjustTerminalFontSize(TERMINAL_DEFAULT_FONT_SIZE - getTerminalFontSize(options.profileIdRef.current))
  const applyTerminalZoom = (operation: TerminalZoomOperation, source: 'menu' | 'shortcut' | 'gesture', steps = 1) => {
    const changed =
      operation === 'reset' ? resetTerminalFontSize() : adjustTerminalFontSize((operation === 'in' ? 1 : -1) * steps)
    logTerminalZoom(terminal, `${source}-${operation}`, { changed, steps })
    return changed
  }

  const markTerminalFocused = () => {
    if (!options.isActiveRef.current) {
      return
    }
    lastFocusedTerminal = terminal
    logTerminalZoom(terminal, 'terminal-focused', { tabId: options.tabIdRef.current })
  }
  const markTerminalUnderPointer = () => {
    if (!options.isActiveRef.current) {
      return
    }
    terminalUnderPointer = terminal
    logTerminalZoom(terminal, 'terminal-pointer-entered', { tabId: options.tabIdRef.current })
  }
  const clearTerminalUnderPointer = () => {
    if (terminalUnderPointer !== terminal) {
      return
    }

    terminalUnderPointer = null
    logTerminalZoom(terminal, 'terminal-pointer-left', { tabId: options.tabIdRef.current })
  }
  terminalTextarea?.addEventListener('focus', markTerminalFocused)

  const writeReconnectHint = () => {
    if (!options.onReconnectRef.current || options.reconnectHintShownRef.current) {
      return
    }

    options.reconnectHintShownRef.current = true
    terminal.write(`\r\n${options.reconnectHintRef.current}\r\n`)
  }
  let lastInputBacklogWarning = -Infinity
  const handleTerminalWriteFailure = (error: unknown) => {
    if (String(error).includes('Terminal input backlog full')) {
      if (Date.now() - lastInputBacklogWarning >= 5000) {
        lastInputBacklogWarning = Date.now()
        terminal.write('\r\n[transterm] Terminal input backlog full; input was not sent.\r\n')
      }
      return
    }
    if (String(error).includes('serial transfer active')) {
      return
    }
    if (options.inputSendFailedRef.current) {
      return
    }
    options.inputSendFailedRef.current = true
    // 一次性写入 devtools 控制台，便于和后端 app.log 里的 panic 行交叉
    // 定位（后端 panic hook 写 scope=panic，前端这里写 tab id）。
    console.warn(
      `[TerminalView] writeTerminal rejected for tab ${options.tabIdRef.current}; worker likely dead, degrading to disconnected state`,
      error
    )
    // Do not wait for the backend's terminal:state broadcast before
    // allowing Enter to use the reconnect path. A dead worker cannot
    // consume another input packet, so retaining `connected=true` here
    // would make the first retry look swallowed.
    options.connectedRef.current = false
    options.wasConnectedRef.current = false
    terminal.write(`\r\n${options.closedMessageRef.current}\r\n`)
    writeReconnectHint()
  }
  const terminalInputWriteQueue = createTerminalInputWriteQueue({
    getTabId: () => options.tabIdRef.current,
    write: (tabId, data) => window.transterm?.writeTerminal(tabId, data),
    shouldStop: () => options.inputSendFailedRef.current
  })
  const writeTerminalInput = (data: string, onFailure = handleTerminalWriteFailure) => {
    void terminalInputWriteQueue.write(data, onFailure)
  }
  const requestReconnect = () => {
    if (options.wasConnectedRef.current || options.connectingRef.current || options.isReconnectingRef.current) {
      return false
    }

    const reconnect = options.onReconnectRef.current
    if (!reconnect) {
      return false
    }

    options.isReconnectingRef.current = true
    options.reconnectHintShownRef.current = false
    // Give immediate feedback before the IPC call starts. The connection
    // result may arrive seconds later, so waiting for terminal:state makes
    // a successful Enter look like a swallowed keypress.
    terminal.write(`\r\n${t.terminalReconnecting}\r\n`)
    void Promise.resolve(reconnect())
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : String(cause)
        terminal.write(`\r\n${t.connectionFailedPrefix}${message}\r\n`)
        writeReconnectHint()
      })
      .finally(() => {
        if (!options.wasConnectedRef.current) {
          options.isReconnectingRef.current = false
        }
      })
    return true
  }
  const getTerminalZoomOperation = (event: KeyboardEvent): TerminalZoomOperation | null => {
    const isZoomInKey = event.key === '+' || event.key === '=' || event.code === 'Equal' || event.code === 'NumpadAdd'
    const isZoomOutKey =
      event.key === '-' || event.key === '_' || event.code === 'Minus' || event.code === 'NumpadSubtract'
    const isZoomResetKey = event.code === 'Digit0' || event.code === 'Numpad0' || event.key === '0' || event.key === ')'

    // Keep app/window zoom out of the way of remote programs. Cmd± on macOS
    // and Ctrl+Shift± on Windows/Linux adjust only this terminal.
    const matchesZoomIn = isMac
      ? event.metaKey && !event.ctrlKey && !event.altKey && isZoomInKey
      : event.ctrlKey && event.shiftKey && !event.altKey && isZoomInKey
    const matchesZoomOut = isMac
      ? event.metaKey && !event.ctrlKey && !event.altKey && isZoomOutKey
      : event.ctrlKey && event.shiftKey && !event.altKey && isZoomOutKey
    // Keep the browser-standard Cmd+0 reset on macOS. Windows/Linux use
    // Ctrl+0: Ctrl+Shift+0 is intercepted by Windows IME/layout switching
    // before WebView2 ever forwards the physical zero key. Some keyboard
    // layouts report Shift+0 as ')', so always prefer code too.
    const matchesZoomReset = isMac
      ? event.metaKey && !event.ctrlKey && !event.altKey && isZoomResetKey
      : event.ctrlKey && !event.altKey && isZoomResetKey

    return matchesZoomReset ? 'reset' : matchesZoomIn ? 'in' : matchesZoomOut ? 'out' : null
  }

  return {
    ...options,
    terminal,
    fitAddon,
    searchAddon,
    terminalTextarea: terminalTextarea ?? null,
    terminalLogColorizer,
    adjustTerminalFontSize,
    applyTerminalZoom,
    markTerminalFocused,
    markTerminalUnderPointer,
    clearTerminalUnderPointer,
    writeReconnectHint,
    writeTerminalInput,
    requestReconnect,
    getTerminalZoomOperation,
    isLastFocusedTerminal: () => lastFocusedTerminal === terminal,
    isTerminalUnderPointer: () => terminalUnderPointer === terminal,
    clearGlobalTerminalState: () => clearTerminalGlobalState(terminal),
    disposeCore: () => {
      terminalInputWriteQueue.dispose()
      terminalTextarea?.removeEventListener('focus', markTerminalFocused)
      terminalLogColorizer.dispose()
      renderCacheLimits.dispose()
      emojiWidths.dispose()
      foregroundAdapter.dispose()
      blockGlyphRenderer.dispose()
      selectionRenderer.dispose()
      symbolGlyphRenderer.dispose()
      options.terminalLogColorizerRef.current = null
      options.fitAddonRef.current = null
      options.searchAddonRef.current = null
      options.setTerminalScrollableElement(null)
      options.terminalRef.current = null
      clearTerminalGlobalState(terminal)
      terminal.dispose()
    }
  }
}
