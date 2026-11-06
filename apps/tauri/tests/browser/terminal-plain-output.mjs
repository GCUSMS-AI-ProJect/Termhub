/* global window, document, Element, requestAnimationFrame */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadTypeScript } from './helpers/load-typescript.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')
const require = createRequire(import.meta.url)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const browser = await (process.env.PLAYWRIGHT_ENGINE === 'webkit' ? webkit : chromium).launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH
})
try {
  const reports = []
  for (const adapted of [false, true]) {
    const page = await browser.newPage()
    await page.setContent('<div id="host" style="height:250px"></div>')
    await page.addStyleTag({ path: root + '/node_modules/@xterm/xterm/css/xterm.css' })
    await page.addScriptTag({ path: root + '/node_modules/@xterm/xterm/lib/xterm.js' })
    for (const [file, name] of [
      ['xterm-adapters/terminal-symbol-glyph-renderer', 'registerTerminalSymbolGlyphRenderer'],
      ['xterm-adapters/terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer'],
      ['xterm-adapters/terminal-selection-renderer', 'registerTerminalSelectionRenderer'],
      ['xterm-adapters/terminal-foreground-adapter', 'registerTerminalForegroundAdapter'],
      ['xterm-adapters/terminal-render-cache', 'registerTerminalRenderCacheLimits']
    ])
      await loadTypeScript(page, root + '/apps/tauri/src/renderer/' + file + '.ts', name)
    const report = await page.evaluate(async (adapted) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
      const terminal = new window.Terminal({ cols: 90, rows: 10, allowProposedApi: true, cursorBlink: false })
      terminal.open(document.getElementById('host'))
      const adapters = adapted
        ? [
            'registerTerminalSymbolGlyphRenderer',
            'registerTerminalBlockGlyphRenderer',
            'registerTerminalSelectionRenderer',
            'registerTerminalForegroundAdapter',
            'registerTerminalRenderCacheLimits'
          ].map((name) => window[name](terminal))
        : []
      const write = (text) => new Promise((resolve) => terminal.write(text, resolve))
      await frame()
      await frame()
      let boxes = 0
      const original = Element.prototype.getBoundingClientRect
      Element.prototype.getBoundingClientRect = function () {
        boxes++
        return original.call(this)
      }
      for (let index = 0; index < 40; index++) {
        const text = index % 2 ? '中文 á abc ' : 'plain ASCII log 123 '
        await write(
          '\x1b[H' + Array.from({ length: 8 }, (_, row) => `\x1b[${row + 1};1H${text.repeat(4)}\x1b[K`).join('')
        )
        await frame()
      }
      await frame()
      const plainBoxes = boxes
      await write(
        '\x1b[H' + Array.from({ length: 8 }, (_, row) => `\x1b[${row + 1};1H${'▄'.repeat(45)}\x1b[K`).join('')
      )
      await frame()
      const graphicCanvases = terminal.element.querySelectorAll('.xterm-block-glyph-row').length
      terminal.resize(90, 3)
      await frame()
      const resizedCanvases = terminal.element.querySelectorAll('.xterm-block-glyph-row').length
      await write('\x1b[H\x1b[2Jplain ASCII')
      await frame()
      const clearedCanvases = terminal.element.querySelectorAll('.xterm-block-glyph-row').length
      Element.prototype.getBoundingClientRect = original
      adapters.forEach((adapter) => adapter.dispose())
      terminal.dispose()
      return { adapted, plainBoxes, graphicCanvases, resizedCanvases, clearedCanvases }
    }, adapted)
    reports.push(report)
    await page.close()
  }
  assert.equal(reports[1].plainBoxes, reports[0].plainBoxes, 'plain output must add no adapter layout reads')
  assert.ok(reports[1].graphicCanvases > 0, 'graphics must retain their cell renderer')
  assert.ok(reports[1].resizedCanvases <= 3, 'shrinking rows must remove out-of-range canvases')
  assert.equal(reports[1].clearedCanvases, 0, 'replacing graphics with plain text must remove stale canvases')
  console.log(JSON.stringify(reports))
} finally {
  await browser.close()
}
