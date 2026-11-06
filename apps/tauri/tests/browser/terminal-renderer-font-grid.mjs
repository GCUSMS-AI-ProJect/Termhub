/* global window, document, requestAnimationFrame, FontFace, NodeFilter */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTypeScript } from './helpers/load-typescript.mjs'
import { registerComparisonGridCalibration, readComparisonGridMetrics } from './helpers/terminal-grid-calibration.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
assert.ok(process.env.TRANSTERM_WEBGL_BUNDLE)
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 })
  const cdp = await page.context().newCDPSession(page)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setContent('<main id="panes" style="display:flex;gap:20px"></main>')
  await page.addStyleTag({ path: root + 'node_modules/@xterm/xterm/css/xterm.css' })
  await page.addStyleTag({ path: root + 'apps/tauri/src/renderer/xterm-adapters/xterm-compat.css' })
  const fonts = {}
  for (const [family, file] of [
    ['Grid Mono', 'jetbrains-mono/JetBrainsMono-400.ttf'],
    ['Grid Imported', 'outfit/Outfit-400.ttf'],
    ['Grid CJK', 'noto-sans-sc/NotoSansSC-Variable.ttf']
  ]) {
    fonts[family] = readFileSync(root + 'apps/tauri/src/renderer/assets/fonts/text/' + file).toString('base64')
    await page.addStyleTag({
      content: `@font-face {font-family:'${family}';src:url(data:font/ttf;base64,${fonts[family]})}`
    })
  }
  await page.evaluate(async () => {
    await Promise.all(
      ['Grid Mono', 'Grid Imported', 'Grid CJK'].map((family) => document.fonts.load(`14px "${family}"`))
    )
  })
  for (const path of [
    'node_modules/@xterm/xterm/lib/xterm.js',
    'node_modules/@xterm/addon-unicode11/lib/addon-unicode11.js',
    'node_modules/@xterm/addon-fit/lib/addon-fit.js'
  ])
    await page.addScriptTag({ path: root + path })
  await page.addScriptTag({ path: resolve(process.env.TRANSTERM_WEBGL_BUNDLE) })
  for (const [file, symbol] of [
    ['xterm-adapters/terminal-options', 'getTerminalCompatibilityOptions'],
    ['xterm-adapters/terminal-emoji-widths', 'registerTerminalEmojiWidths'],
    ['xterm-adapters/terminal-symbol-glyph-renderer', 'registerTerminalSymbolGlyphRenderer'],
    ['xterm-adapters/terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer'],
    ['xterm-adapters/terminal-selection-renderer', 'registerTerminalSelectionRenderer'],
    ['xterm-adapters/terminal-render-recovery', 'observeTerminalFontMetrics']
  ])
    await loadTypeScript(page, root + 'apps/tauri/src/renderer/' + file + '.ts', symbol)
  await page.addScriptTag({
    content: `window.registerComparisonGridCalibration=${registerComparisonGridCalibration};window.readComparisonGridMetrics=${readComparisonGridMetrics};`
  })
  const control = await page.evaluate(async () => {
    window.settle = async () => {
      for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame)
    }
    window.createRuntime = (backend, fontFamily = '"Grid Mono", "Grid CJK", monospace') => {
      const host = document.createElement('div')
      host.className = 'terminal-host'
      host.style.cssText = 'width:777px;height:333px;flex:none'
      document.getElementById('panes').append(host)
      const terminal = new window.Terminal({
        ...window.getTerminalCompatibilityOptions(false),
        cols: 90,
        rows: 10,
        fontFamily,
        fontSize: 14,
        lineHeight: 1.05,
        allowProposedApi: true,
        cursorBlink: false,
        theme: { background: '#111111', foreground: '#dddddd' }
      })
      terminal.loadAddon(new window.Unicode11Addon.Unicode11Addon())
      terminal.unicode.activeVersion = '11'
      const fit = new window.FitAddon.FitAddon()
      terminal.loadAddon(fit)
      const disposables = [window.registerTerminalEmojiWidths(terminal)]
      terminal.open(host)
      if (backend === 'webgl') terminal.loadAddon(new window.WebglAddon.WebglAddon())
      const uncalibrated = window.readComparisonGridMetrics(terminal)
      const calibration = window.registerComparisonGridCalibration(terminal, backend)
      disposables.push(calibration)
      if (backend === 'dom')
        for (const name of [
          'registerTerminalSelectionRenderer',
          'registerTerminalSymbolGlyphRenderer',
          'registerTerminalBlockGlyphRenderer'
        ])
          disposables.push(window[name](terminal))
      return {
        backend,
        host,
        terminal,
        fit,
        uncalibrated,
        dispose() {
          disposables.reverse().forEach((item) => item.dispose())
          terminal.dispose()
          host.remove()
        }
      }
    }
    window.runtimes = ['dom', 'webgl'].map((backend) => window.createRuntime(backend))
    return window.runtimes.map((runtime) => runtime.uncalibrated)
  })
  assert.ok(
    Math.abs(control[0].cellWidth - control[1].cellWidth) > 0.2,
    'control must reproduce fractional grid mismatch'
  )
  const check = async (label) => {
    const result = await page.evaluate(async (label) => {
      const lines = ['|123456789|', '|中文，。|', '|e\u0301🧪✻|', '|▢────────────|']
      for (const { terminal, fit } of window.runtimes) {
        fit.fit()
        terminal.reset()
        await new Promise((resolve) => terminal.write(lines.join('\r\n'), resolve))
      }
      await window.settle()
      return {
        label,
        runtimes: window.runtimes.map(({ backend, host, terminal, fit }) => {
          const grid = window.readComparisonGridMetrics(terminal)
          terminal.select(1, 1, 4)
          const selection = terminal.getSelection()
          terminal.clearSelection()
          const rect = host.querySelector('.xterm-screen').getBoundingClientRect()
          const hits = [0, 7, terminal.cols - 1].map((col) =>
            terminal._core._mouseService.getCoords(
              {
                clientX: rect.left + ((col + 0.25) * rect.width) / terminal.cols,
                clientY: rect.top + (0.25 * rect.height) / terminal.rows
              },
              host.querySelector('.xterm-screen'),
              terminal.cols,
              terminal.rows,
              false
            )
          )
          const widths = lines.map((_, row) => {
            const line = terminal.buffer.active.getLine(row)
            return Array.from({ length: line.length }, (_, col) => {
              const cell = line.getCell(col)
              return [cell.getChars(), cell.getWidth()]
            })
          })
          let barErrors = []
          if (backend === 'dom')
            barErrors = Array.from(host.querySelector('.xterm-rows').children)
              .slice(0, lines.length)
              .map((row, index) => {
                const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
                const bars = []
                while (walker.nextNode())
                  for (let i = 0; i < walker.currentNode.length; i++)
                    if (walker.currentNode.textContent[i] === '|') {
                      const range = document.createRange()
                      range.setStart(walker.currentNode, i)
                      range.setEnd(walker.currentNode, i + 1)
                      bars.push(range.getBoundingClientRect().left)
                    }
                const line = terminal.buffer.active.getLine(index)
                let last = 0
                for (let col = 0; col < line.length; col++) if (line.getCell(col).getChars() === '|') last = col
                return bars.at(-1) - bars[0] - last * grid.cellWidth
              })
          return {
            backend,
            grid,
            screenWidth: rect.width,
            screenHeight: rect.height,
            fit: fit.proposeDimensions(),
            selection,
            hits,
            widths,
            barErrors
          }
        })
      }
    }, label)
    const [dom, gl] = result.runtimes
    for (const key of [
      'cols',
      'rows',
      'cellWidth',
      'cellHeight',
      'canvasWidth',
      'canvasHeight',
      'deviceCellWidth',
      'deviceCellHeight',
      'measuredWidth'
    ])
      assert.ok(
        Math.abs(dom.grid[key] - gl.grid[key]) < 1e-7,
        `${label} ${key}: ${JSON.stringify({ dom: dom.grid, gl: gl.grid })}`
      )
    assert.deepEqual(dom.fit, gl.fit)
    assert.deepEqual(dom.widths, gl.widths)
    for (const runtime of result.runtimes) {
      assert.equal(runtime.selection, '中文', label)
      assert.deepEqual(
        runtime.hits.map((hit) => hit[0]),
        [1, 8, runtime.grid.cols],
        label
      )
      assert.ok(Math.abs(runtime.screenWidth - runtime.grid.canvasWidth) < 0.05, label)
      assert.ok(Math.abs(runtime.screenHeight - runtime.grid.canvasHeight) < 0.05, label)
    }
    assert.ok(
      dom.barErrors.every((error) => Math.abs(error) < 1),
      `${label} text drift ${dom.barErrors}`
    )
    return {
      ...result,
      runtimes: result.runtimes.map((runtime) => {
        const copy = { ...runtime }
        delete copy.widths
        return copy
      })
    }
  }
  const results = []
  for (const dpr of [1, 1.1, 1.25, 1.5, 2]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1800,
      height: 1000,
      deviceScaleFactor: dpr,
      mobile: false
    })
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('resize'))
      await window.settle()
    })
    assert.ok(Math.abs((await page.evaluate(() => window.devicePixelRatio)) - dpr) < 1e-6)
    for (const family of ['"Grid Mono", "Grid CJK", monospace', '"Grid Imported", "Grid CJK", monospace'])
      for (const size of [12, 13.65, 14, 16, 24]) {
        await page.evaluate(
          ({ family, size }) => {
            for (const { terminal } of window.runtimes) {
              terminal.options.fontFamily = family
              terminal.options.fontSize = size
            }
          },
          { family, size }
        )
        results.push(await check(`DPR ${dpr} ${family} ${size}px`))
      }
  }
  const late = await page.evaluate(async (font) => {
    document.documentElement.style.setProperty('--font-mono', '"Late, Grid"')
    const disposers = window.runtimes.map(({ terminal, fit }) =>
      window.observeTerminalFontMetrics(terminal, () => fit.fit())
    )
    await window.settle()
    const before = window.runtimes.map(({ terminal }) => terminal.cols)
    const face = new FontFace('Late, Grid', `url(data:font/ttf;base64,${font})`)
    document.fonts.add(face)
    window.dispatchEvent(new Event('transterm:imported-fonts-changed'))
    await document.fonts.load('24px "Late, Grid"')
    await document.fonts.ready
    await window.settle()
    const after = window.runtimes.map(({ terminal }) => terminal.cols)
    const references = window.runtimes.map(({ backend, terminal }) => {
      const reference = window.createRuntime(backend, terminal.options.fontFamily)
      reference.terminal.options.fontSize = terminal.options.fontSize
      reference.fit.fit()
      const cols = reference.terminal.cols
      reference.dispose()
      return cols
    })
    disposers.forEach((dispose) => dispose())
    return { before, after, references }
  }, fonts['Grid Imported'])
  assert.notDeepEqual(late.before, late.after, 'late font must change the fallback grid')
  assert.deepEqual(late.after, late.references, 'late font must match freshly created calibrated terminals')
  results.push(await check('late imported font'))
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1800,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  })
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('resize'))
    for (const { terminal } of window.runtimes) {
      terminal.options.fontFamily = '"Grid Mono", "Grid CJK", monospace'
      terminal.options.fontSize = 14
    }
    await window.settle()
  })
  results.push(await check('restored default font and DPI'))
  const screenshot = process.env.TRANSTERM_GRID_SCREENSHOT || '/tmp/transterm-renderer-font-grid.png'
  await page.screenshot({ path: screenshot })
  await page.evaluate(() => window.runtimes.forEach((runtime) => runtime.dispose()))
  assert.deepEqual(errors, [])
  writeFileSync(
    process.env.TRANSTERM_GRID_OUTPUT || '/tmp/transterm-renderer-font-grid.json',
    JSON.stringify({ control, late, results, screenshot }, null, 2) + '\n'
  )
  console.log(
    JSON.stringify({ cases: results.length, control: control.map((grid) => grid.cellWidth), late, screenshot })
  )
} finally {
  await browser.close()
}
