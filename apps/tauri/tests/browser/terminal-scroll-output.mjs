/* global window, document, Element, requestAnimationFrame */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadTypeScript } from './helpers/load-typescript.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
try {
  const page = await browser.newPage()
  await page.setContent('<div id="host"></div>')
  await page.addStyleTag({ path: root + 'node_modules/@xterm/xterm/css/xterm.css' })
  await page.addScriptTag({ path: root + 'node_modules/@xterm/xterm/lib/xterm.js' })
  for (const [file, symbol] of [
    ['xterm-adapters/terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer'],
    ['components/terminal-scroll-controller', 'createTerminalScrollController'],
    ['xterm-adapters/terminal-foreground-adapter', 'registerTerminalForegroundAdapter']
  ])
    await loadTypeScript(page, root + 'apps/tauri/src/renderer/' + file + '.ts', symbol)
  const report = await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const terminal = new window.Terminal({
      cols: 80,
      rows: 12,
      scrollback: 200,
      allowProposedApi: true,
      cursorBlink: false
    })
    terminal.open(document.getElementById('host'))
    const adapters = [
      window.registerTerminalBlockGlyphRenderer(terminal),
      window.registerTerminalForegroundAdapter(terminal)
    ]
    let scrollNotifications = 0
    const scrollController = window.createTerminalScrollController(
      { current: terminal },
      terminal.element.querySelector('.xterm-scrollable-element')
    )
    const unsubscribe = scrollController.subscribe(() => scrollNotifications++)
    const write = (text) => new Promise((resolve) => terminal.write(text, resolve))
    await write(('\x1b[38;2;255;255;255m' + '─'.repeat(30) + '\r\n').repeat(20))
    await frame()
    await frame()
    scrollNotifications = 0
    let boxes = 0
    let reads = 0
    const originalBox = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      boxes++
      return originalBox.call(this)
    }
    const buffer = terminal.buffer.normal
    const originalLine = buffer.getLine
    buffer.getLine = function (...args) {
      reads++
      return originalLine.apply(this, args)
    }
    await write(('\x1b[38;2;255;255;255m' + '─'.repeat(30) + '\r\n').repeat(200))
    const parsing = { boxes, reads, scrollNotifications }
    await frame()
    await frame()
    const canvases = terminal.element.querySelectorAll('.xterm-block-glyph-row').length
    const settledNotifications = scrollNotifications
    terminal.refresh(0, terminal.rows - 1)
    await frame()
    await frame()
    const repaintNotifications = scrollNotifications - settledNotifications
    terminal.scrollToTop()
    await frame()
    await frame()
    const scrolledCanvases = terminal.element.querySelectorAll('.xterm-block-glyph-row').length
    terminal.resize(80, 5)
    await frame()
    await frame()
    const resizedCanvases = terminal.element.querySelectorAll('.xterm-block-glyph-row').length
    terminal.scrollToBottom()
    await frame()
    await frame()
    scrollNotifications = 0
    for (let index = 0; index < 100; index++) await write(`\r\noutput ${index}`)
    await frame()
    await frame()
    const saturatedNotifications = scrollNotifications
    await write('\x1b[?1049h')
    await frame()
    await frame()
    scrollNotifications = 0
    for (let index = 0; index < 100; index++) {
      await write(`\x1b[H\x1b[2K\x1b[38;2;255;255;255m─ CC fullscreen ${index}\x1b[0m`)
    }
    await frame()
    await frame()
    const fullscreenNotifications = scrollNotifications
    await write('\x1b[?1049l')
    await frame()
    await frame()
    const restoredNotifications = scrollNotifications
    Element.prototype.getBoundingClientRect = originalBox
    buffer.getLine = originalLine
    unsubscribe()
    adapters.forEach((adapter) => adapter.dispose())
    terminal.dispose()
    return {
      parsing,
      repaintNotifications,
      canvases,
      scrolledCanvases,
      resizedCanvases,
      saturatedNotifications,
      fullscreenNotifications,
      restoredNotifications
    }
  })
  console.log(JSON.stringify(report))
  assert.ok(report.parsing.boxes < 100, 'scrolling output must not measure layout once per emitted line')
  assert.ok(report.parsing.reads < 200, 'foreground scans must be batched, not run once per emitted line')
  assert.ok(
    report.parsing.scrollNotifications > 0 && report.parsing.scrollNotifications < 5,
    'scrollbar notifications must be batched per parser task'
  )
  assert.equal(report.repaintNotifications, 0, 'cursor or selection repaints must not update scroll metrics')
  assert.equal(report.fullscreenNotifications, 0, 'fullscreen writes must not update unchanged scroll metrics')
  assert.equal(report.saturatedNotifications, 0, 'output at the history limit must not update unchanged scroll metrics')
  assert.equal(report.restoredNotifications, 1, 'returning to normal history must update scroll metrics')
  assert.ok(report.canvases > 0, 'output graphics still render')
  assert.ok(report.scrolledCanvases > 0, 'scrolling history still renders graphics')
  assert.ok(report.resizedCanvases > 0 && report.resizedCanvases <= 5, 'resize redraws and removes excess canvases')
} finally {
  await browser.close()
}
