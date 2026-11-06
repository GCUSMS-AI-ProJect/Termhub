/* global window, document, requestAnimationFrame, MutationObserver */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTypeScript } from './helpers/load-typescript.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')
const require = createRequire(import.meta.url)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const baseline = process.env.TRANSTERM_PERF_BASELINE === '1'
const durationMs = Number(process.env.TRANSTERM_SOAK_MS || 60000)
const baselineDirectory = baseline ? mkdtempSync(join(tmpdir(), 'transterm-perf-baseline-')) : null
assert.ok(Number.isFinite(durationMs) && durationMs >= 1000)
const browser = await (process.env.PLAYWRIGHT_ENGINE === 'webkit' ? webkit : chromium).launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH
})
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setContent(
    '<input id="input"><button id="button">click</button><output id="clicks">0</output><div class="fs-shell"><aside class="fs-sidebar"><div class="sys-card"><header data-file-panel-snap-target="disk-header"></header></div></aside><main id="panes" style="display:grid;grid-template-columns:repeat(2,1fr)"></main></div>'
  )
  await page.addStyleTag({ path: root + '/node_modules/@xterm/xterm/css/xterm.css' })
  await page.addScriptTag({ path: root + '/node_modules/@xterm/xterm/lib/xterm.js' })
  for (const [file, symbol] of [
    ['xterm-adapters/terminal-symbol-glyph-renderer', 'registerTerminalSymbolGlyphRenderer'],
    ['xterm-adapters/terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer'],
    ['xterm-adapters/terminal-selection-renderer', 'registerTerminalSelectionRenderer'],
    ['xterm-adapters/terminal-foreground-adapter', 'registerTerminalForegroundAdapter'],
    ['xterm-adapters/terminal-log-colorizer', 'TerminalLogColorizer'],
    ['xterm-adapters/terminal-render-cache', 'registerTerminalRenderCacheLimits'],
    ['features/workspace/file-panel-layout-observer', 'observeFilePanelLayout']
  ]) {
    if (baseline && ['registerTerminalRenderCacheLimits', 'observeFilePanelLayout'].includes(symbol)) continue
    let path = root + '/apps/tauri/src/renderer/' + file + '.ts'
    if (baseline && symbol === 'TerminalLogColorizer') {
      path = join(baselineDirectory, 'terminal-log-colorizer.ts')
      writeFileSync(
        path,
        execFileSync(
          'git',
          ['show', `${process.env.TRANSTERM_PERF_BASELINE_REF || 'HEAD'}:apps/tauri/src/renderer/${file}.ts`],
          { cwd: root }
        )
      )
    }
    if (existsSync(path)) await loadTypeScript(page, path, symbol)
  }
  const resultPromise = page.evaluate(
    async ({ baseline, durationMs }) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const palette = Object.fromEntries(
        [
          'timestamp',
          'service',
          'error',
          'warning',
          'success',
          'info',
          'debug',
          'address',
          'number',
          'permission',
          'flag'
        ].map((key) => [key, '#aabbcc'])
      )
      let clicks = 0
      document.getElementById('button').onclick = () =>
        (document.getElementById('clicks').textContent = String(++clicks))
      let layoutChecks = 0
      const observed = new Set()
      const shell = document.querySelector('.fs-shell')
      const disposeLayout = window.observeFilePanelLayout
        ? window.observeFilePanelLayout(
            shell,
            { observe: (node) => observed.add(node), unobserve: (node) => observed.delete(node) },
            () => layoutChecks++
          )
        : (() => {
            const observer = new MutationObserver(() => layoutChecks++)
            observer.observe(shell, {
              attributes: true,
              attributeFilter: ['class', 'style'],
              childList: true,
              subtree: true
            })
            return () => observer.disconnect()
          })()
      const runtimes = []
      const create = (host) => {
        const terminal = new window.Terminal({
          cols: 90,
          rows: 10,
          scrollback: 6000,
          cursorBlink: false,
          allowProposedApi: true,
          minimumContrastRatio: 4.5,
          theme: { foreground: '#dddddd', background: '#111111' }
        })
        terminal.open(host)
        const adapters = [
          'registerTerminalSymbolGlyphRenderer',
          'registerTerminalBlockGlyphRenderer',
          'registerTerminalSelectionRenderer',
          'registerTerminalForegroundAdapter',
          'registerTerminalRenderCacheLimits'
        ].flatMap((name) => (window[name] ? [window[name](terminal)] : []))
        const colorizer = new window.TerminalLogColorizer(terminal, palette)
        return {
          terminal,
          colorizer,
          write: (data) => new Promise((resolve) => terminal.write(data, resolve)),
          dispose: () => {
            colorizer.dispose()
            adapters.forEach((adapter) => adapter.dispose())
            terminal.dispose()
          }
        }
      }
      for (let index = 0; index < 10; index++) {
        const host = document.createElement('div')
        host.style.height = '190px'
        document.getElementById('panes').append(host)
        runtimes.push(create(host))
      }
      // Populate the same bounded history used by production, rather than only repainting an empty screen.
      await Promise.all(runtimes.map((runtime) => runtime.write('info worker: ready 123ms 中文\r\n'.repeat(6500))))
      await frame()
      let fullHistoryScans = 0
      for (const { terminal } of runtimes) {
        const buffer = terminal.buffer.normal
        const getLine = buffer.getLine.bind(buffer)
        buffer.getLine = (row) => {
          fullHistoryScans++
          return getLine(row)
        }
      }
      const themeStarted = performance.now()
      for (let change = 0; change < 10; change++) {
        for (const { colorizer } of runtimes) colorizer.setPalette({ ...palette })
      }
      const unchangedPaletteMs = performance.now() - themeStarted
      const unchangedPaletteLines = fullHistoryScans
      layoutChecks = 0
      const gaps = []
      let last = performance.now()
      const heartbeat = setInterval(() => {
        const now = performance.now()
        gaps.push(now - last)
        last = now
      }, 10)
      let writes = 0
      let maxContrastEntries = 0
      let maxWidthEntries = 0
      let maxNodes = 0
      const count = (cache) =>
        Math.max(
          ...['_css', '_color'].map((kind) =>
            Object.values(cache?.[kind]?._data || {}).reduce((total, row) => total + Object.keys(row || {}).length, 0)
          )
        )
      const sample = () => {
        for (const { terminal } of runtimes) {
          const core = terminal._core
          maxContrastEntries = Math.max(
            maxContrastEntries,
            count(core._themeService.colors.contrastCache),
            count(core._themeService.colors.halfContrastCache)
          )
          maxWidthEntries = Math.max(maxWidthEntries, core._renderService._renderer.value._widthCache._holey.size)
        }
        maxNodes = Math.max(maxNodes, document.querySelectorAll('*').length)
      }
      const started = performance.now()
      while (performance.now() - started < durationMs) {
        const data =
          (writes % 400 === 0 ? '\x1b[?1049h' : writes % 400 === 200 ? '\x1b[?1049l' : '') +
          '\x1b[H' +
          Array.from(
            { length: 9 },
            (_, row) =>
              Array.from({ length: 80 }, (_, column) => {
                const id = writes * 720 + row * 80 + column
                const color = (id * 2654435761) >>> 0
                const r = (color >>> 16) & 255,
                  g = (color >>> 8) & 255,
                  b = color & 255
                const combined =
                  'a' +
                  String.fromCharCode(0x300 + (id % 112)) +
                  String.fromCharCode(0x300 + (Math.floor(id / 112) % 112))
                return `\x1b[38;2;${r};${g};${b}m${column % 20 ? combined : '✻'}`
              }).join('') + '\x1b[0m\r\n'
          ).join('')
        // All bytes are parsed; limiting production speed here does not discard display data.
        await Promise.all(runtimes.map((runtime) => runtime.write(data)))
        await wait(20)
        writes++
        if (writes % 10 === 0) sample()
      }
      sample()
      clearInterval(heartbeat)
      const terminalLayoutChecks = layoutChecks
      const oldCard = shell.querySelector('.sys-card')
      const newCard = oldCard.cloneNode(true)
      oldCard.replaceWith(newCard)
      await wait(0)
      const replacementObserved = !window.observeFilePanelLayout || (observed.has(newCard) && !observed.has(oldCard))
      await wait(250)
      const idleChecks = layoutChecks
      await wait(250)
      const idleLayoutChecks = layoutChecks - idleChecks
      const beforeDisposeNodes = document.querySelectorAll('*').length
      runtimes.forEach((runtime) => runtime.dispose())
      for (let cycle = 0; cycle < 20; cycle++) {
        const host = document.createElement('div')
        shell.querySelector('main').append(host)
        const runtime = create(host)
        await runtime.write('info ✻ 中文\r\n')
        runtime.dispose()
        host.remove()
      }
      disposeLayout()
      gaps.sort((a, b) => a - b)
      return {
        baseline,
        durationMs,
        writesPerTerminal: writes,
        unchangedPaletteMs,
        unchangedPaletteLines,
        terminalLayoutChecks,
        replacementObserved,
        idleLayoutChecks,
        maxContrastEntries,
        maxWidthEntries,
        maxNodes,
        beforeDisposeNodes,
        afterDisposeNodes: document.querySelectorAll('*').length,
        p95EventLoopMs: gaps[Math.floor(gaps.length * 0.95)],
        maxEventLoopMs: gaps.at(-1)
      }
    },
    { baseline, durationMs }
  )
  const inputAndClickMs = []
  const inputStarted = performance.now()
  for (let index = 0; index < 20; index++) {
    await page.waitForTimeout(Math.max(0, inputStarted + ((index + 1) * durationMs) / 20 - performance.now()))
    const started = performance.now()
    await page.locator('#input').fill(`输入 ${index}`)
    await page.locator('#button').click()
    inputAndClickMs.push(Math.round(performance.now() - started))
  }
  const result = await resultPromise
  assert.equal(await page.locator('#clicks').textContent(), '20')
  assert.equal(await page.locator('#input').inputValue(), '输入 19')
  console.log(JSON.stringify({ ...result, inputAndClickMs }))
  assert.deepEqual(errors, [])
  assert.ok(result.writesPerTerminal > 0)
  assert.ok(result.afterDisposeNodes < 100, 'dispose must release terminal DOM across replacement cycles')
  assert.equal(result.idleLayoutChecks, 0)
  assert.equal(result.replacementObserved, true, 'sidebar replacement must rebind resize targets')
  if (!baseline) {
    assert.equal(result.unchangedPaletteLines, 0, 'search/selection theme changes must not scan history')
    assert.equal(result.terminalLayoutChecks, 0, 'terminal repaint must not schedule file-panel layout')
    assert.ok(result.maxContrastEntries <= 8192, 'dynamic RGB pairs must have a bounded cache')
    assert.ok(result.maxWidthEntries <= 16384, 'combined glyph widths must have a bounded cache')
  }
} finally {
  await browser.close()
  if (baselineDirectory) rmSync(baselineDirectory, { recursive: true })
}
