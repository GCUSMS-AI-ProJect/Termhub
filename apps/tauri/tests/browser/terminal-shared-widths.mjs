/* global window, document, requestAnimationFrame */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
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
  const pixels = []
  for (const shared of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
    const profiler =
      process.env.TRANSTERM_CPU_PROFILE && process.env.PLAYWRIGHT_ENGINE !== 'webkit'
        ? await page.context().newCDPSession(page)
        : null
    await page.setContent('<div id="panes" style="display:grid;grid-template-columns:repeat(2,1fr)"></div>')
    await page.addStyleTag({ path: root + '/node_modules/@xterm/xterm/css/xterm.css' })
    await page.addStyleTag({ path: root + '/apps/tauri/src/renderer/xterm-adapters/xterm-compat.css' })
    for (const [name, path, weight] of [
      ['Bench Mono', 'jetbrains-mono/JetBrainsMono-400.ttf', '400'],
      ['Bench Mono', 'jetbrains-mono/JetBrainsMono-700.ttf', '700'],
      ['Bench CJK', 'noto-sans-sc/NotoSansSC-Variable.ttf', '100 900']
    ]) {
      const data = readFileSync(root + '/apps/tauri/src/renderer/assets/fonts/text/' + path).toString('base64')
      await page.addStyleTag({
        content: `@font-face{font-family:'${name}';font-weight:${weight};src:url(data:font/ttf;base64,${data})}`
      })
    }
    await page.evaluate(async () => {
      await document.fonts.load('14px "Bench Mono"')
      await document.fonts.load('bold 14px "Bench Mono"')
      await document.fonts.load('14px "Bench CJK"')
    })
    await page.addScriptTag({ path: root + '/node_modules/@xterm/xterm/lib/xterm.js' })
    for (const [file, name] of [
      ['xterm-adapters/terminal-symbol-glyph-renderer', 'registerTerminalSymbolGlyphRenderer'],
      ['xterm-adapters/terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer'],
      ['xterm-adapters/terminal-selection-renderer', 'registerTerminalSelectionRenderer'],
      ['xterm-adapters/terminal-foreground-adapter', 'registerTerminalForegroundAdapter'],
      ['xterm-adapters/terminal-render-cache', 'registerTerminalRenderCacheLimits']
    ])
      await loadTypeScript(page, root + '/apps/tauri/src/renderer/' + file + '.ts', name)
    await profiler?.send('Profiler.enable')
    await profiler?.send('Profiler.start')
    const report = await page.evaluate(async (shared) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
      let nativeMeasurements = 0
      const terminals = Array.from({ length: 10 }, () => {
        const host = document.createElement('div')
        host.className = 'terminal-host'
        host.style.height = '190px'
        document.getElementById('panes').append(host)
        const terminal = new window.Terminal({
          cols: 90,
          rows: 10,
          cursorBlink: false,
          minimumContrastRatio: 4.5,
          fontFamily: '"Bench Mono", "Bench CJK", monospace',
          fontSize: 14,
          allowProposedApi: true
        })
        terminal.open(host)
        const widthCache = terminal._core._renderService._renderer.value._widthCache
        const nativeMeasure = widthCache._measure
        const countedNativeMeasure = function (chars, variant) {
          nativeMeasurements++
          return nativeMeasure.call(this, chars, variant)
        }
        widthCache._measure = countedNativeMeasure
        const adapters = [
          'registerTerminalSymbolGlyphRenderer',
          'registerTerminalBlockGlyphRenderer',
          'registerTerminalSelectionRenderer',
          'registerTerminalForegroundAdapter',
          'registerTerminalRenderCacheLimits'
        ].map((name) => window[name](terminal))
        if (!shared) widthCache._measure = countedNativeMeasure
        return {
          terminal,
          dispose: () => {
            adapters.forEach((adapter) => adapter.dispose())
            terminal.dispose()
          }
        }
      })
      const samples = []
      const widths = terminals[0].terminal._core._renderService._renderer.value._widthCache
      const fonts = [
        ['"Bench Mono", "Bench CJK", monospace', 14],
        ['"Bench Mono", "Bench CJK", monospace', 24],
        ['serif', 14]
      ]
      for (const [family, size] of fonts) {
        widths.setFont(family, size, 'normal', 'bold')
        for (const chars of ['W', '中', '，', '。', 'é', 'ā́', '👩‍💻', '✻', '─', ' ']) {
          for (const [bold, italic] of [
            [false, false],
            [true, false],
            [false, true],
            [true, true]
          ]) {
            samples.push(widths.get(chars, bold, italic))
          }
        }
      }
      widths.setFont(fonts[0][0], 14, 'normal', 'bold')
      const started = performance.now()
      nativeMeasurements = 0
      let parsed = 0
      for (let index = 0; index < 30; index++) {
        const data =
          '\x1b[H' +
          Array.from(
            { length: 9 },
            (_, row) =>
              Array.from({ length: 80 }, (_, column) => {
                const id = index * 720 + row * 80 + column
                return (
                  `\x1b[38;2;${id % 255};${(id >>> 8) % 255};123m` +
                  'a' +
                  String.fromCharCode(0x300 + (id % 112)) +
                  String.fromCharCode(0x300 + (Math.floor(id / 112) % 112))
                )
              }).join('') + '\x1b[0m\r\n'
          ).join('')
        await Promise.all(
          terminals.map(
            ({ terminal }) =>
              new Promise((resolve) =>
                terminal.write(data, () => {
                  parsed++
                  resolve()
                })
              )
          )
        )
        await frame()
      }
      const elapsedMs = performance.now() - started
      const cells = terminals[0].terminal.buffer.active.getLine(0).translateToString(true)
      window.disposeWidthFixture = () => terminals.forEach((runtime) => runtime.dispose())
      return { elapsedMs, parsed, nativeMeasurements, samples, cells }
    }, shared)
    if (profiler) {
      const { profile } = await profiler.send('Profiler.stop')
      const hits = new Map()
      for (const sample of profile.samples) hits.set(sample, (hits.get(sample) || 0) + 1)
      report.cpu = profile.nodes
        .map((node) => ({
          name: node.callFrame.functionName,
          hits: hits.get(node.id) || 0,
          file: node.callFrame.url.split('/').at(-1),
          line: node.callFrame.lineNumber
        }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 30)
    }
    assert.equal(report.parsed, 300)
    reports.push({ shared, ...report })
    pixels.push(await page.locator('.terminal-host').first().screenshot())
    await page.evaluate(() => window.disposeWidthFixture())
    await page.close()
  }
  assert.deepEqual(reports[0].samples, reports[1].samples, 'sharing must preserve every calibrated glyph width')
  assert.equal(reports[0].cells, reports[1].cells, 'sharing must preserve terminal text and columns')
  assert.deepEqual(pixels[0], pixels[1], 'shared measurements must preserve rendered pixels')
  assert.ok(
    reports[1].nativeMeasurements < reports[0].nativeMeasurements / 2,
    'matching panes must reuse calibrated measurements'
  )
  console.log(
    JSON.stringify(
      reports.map(({ samples, cells, ...report }) => ({
        ...report,
        widthSamples: samples.length,
        textCharacters: cells.length
      }))
    )
  )
} finally {
  await browser.close()
}
