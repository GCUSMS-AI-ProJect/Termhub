/* global window, document, requestAnimationFrame */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { loadTypeScript } from './helpers/load-typescript.mjs'
import { registerComparisonGridCalibration, readComparisonGridMetrics } from './helpers/terminal-grid-calibration.mjs'

// Experimental only: the addon stays outside the application dependency graph.
const root = fileURLToPath(new URL('../../../../', import.meta.url))
assert.ok(process.env.TRANSTERM_WEBGL_BUNDLE, 'Set TRANSTERM_WEBGL_BUNDLE to the unpacked 0.19.0 addon bundle')
const webglBundle = resolve(process.env.TRANSTERM_WEBGL_BUNDLE)
const addonVersion = JSON.parse(readFileSync(resolve(dirname(webglBundle), '../package.json'))).version
assert.equal(addonVersion, '0.19.0')
const output = resolve(process.env.TRANSTERM_COMPARISON_OUTPUT || '/tmp/transterm-renderer-comparison.json')
const batchCount = Number(process.env.TRANSTERM_BATCH_COUNT || 4000)
const repeats = Number(process.env.TRANSTERM_COMPARISON_REPEATS || 3)
const slowdowns = (process.env.TRANSTERM_COMPARISON_SLOWDOWNS || '1,6').split(',').map(Number)
assert.ok(Number.isInteger(batchCount) && batchCount >= 200)
assert.ok(Number.isInteger(repeats) && repeats > 0)
assert.ok(slowdowns.every((rate) => Number.isFinite(rate) && rate >= 1))
assert.equal(process.platform, 'darwin', 'RSS sampler uses macOS ps; adapt it before testing another platform')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const results = []
const percentile = (values, fraction) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

async function run(mode, slowdown, repetition) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH
  })
  try {
    const browserCdp = await browser.newBrowserCDPSession()
    const { gpu } = await browserCdp.send('SystemInfo.getInfo')
    assert.match(gpu.auxAttributes.glRenderer, /Apple/)
    assert.doesNotMatch(gpu.auxAttributes.glRenderer, /SwiftShader|llvmpipe|software/i)
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await page.setContent('<main id="panes" style="display:grid;grid-template-columns:repeat(2,1fr)"></main>')
    await page.addStyleTag({ path: root + 'node_modules/@xterm/xterm/css/xterm.css' })
    await page.addStyleTag({ path: root + 'apps/tauri/src/renderer/xterm-adapters/xterm-compat.css' })
    const font = readFileSync(
      root + 'apps/tauri/src/renderer/assets/fonts/text/jetbrains-mono/JetBrainsMono-400.ttf'
    ).toString('base64')
    await page.addStyleTag({
      content: `@font-face {font-family: 'Benchmark Mono';src:url(data:font/ttf;base64,${font})}`
    })
    await page.evaluate(() => document.fonts.load('14px "Benchmark Mono"'))
    for (const path of [
      'node_modules/@xterm/xterm/lib/xterm.js',
      'node_modules/@xterm/addon-unicode11/lib/addon-unicode11.js'
    ])
      await page.addScriptTag({ path: root + path })
    // Load the same JS in both arms so bundle parsing does not bias setup memory.
    await page.addScriptTag({ path: webglBundle })
    for (const [file, symbol] of [
      ['bridge/events/terminal-output', 'createTerminalOutputDelivery'],
      ['renderer/xterm-adapters/terminal-symbol-glyph-renderer', 'registerTerminalSymbolGlyphRenderer'],
      ['renderer/xterm-adapters/terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer'],
      ['renderer/xterm-adapters/terminal-selection-renderer', 'registerTerminalSelectionRenderer'],
      ['renderer/xterm-adapters/terminal-foreground-adapter', 'registerTerminalForegroundAdapter'],
      ['renderer/xterm-adapters/terminal-render-cache', 'registerTerminalRenderCacheLimits'],
      ['renderer/xterm-adapters/terminal-log-colorizer', 'TerminalLogColorizer'],
      ['renderer/xterm-adapters/terminal-emoji-widths', 'registerTerminalEmojiWidths'],
      ['renderer/xterm-adapters/terminal-options', 'getTerminalCompatibilityOptions']
    ])
      await loadTypeScript(page, root + 'apps/tauri/src/' + file + '.ts', symbol)
    const actions = ts.transpileModule(
      readFileSync(root + 'apps/tauri/src/renderer/components/terminal-view-actions.ts', 'utf8').replaceAll(
        'import.meta.env.DEV',
        'false'
      ),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
    ).outputText
    await page.addScriptTag({
      content: `(() => {const exports = {}; const require = name => name === 'react' ? {useCallback: callback => callback} : name === './terminal-view-utils' ? {TERMINAL_WRITE_CHUNK_SIZE:16384,splitPaneShortcutsForPlatform:()=>({})} : {}; ${actions}; window.createOutputActions=exports.useTerminalViewActions;})()`
    })
    await page.addScriptTag({
      content: `window.registerComparisonGridCalibration=${registerComparisonGridCalibration};window.readComparisonGridMetrics=${readComparisonGridMetrics};`
    })
    await page.evaluate(async (mode) => {
      const ref = (current) => ({ current })
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
      const terminals = []
      const adapters = []
      const addons = []
      const listeners = new Set()
      window.contextLosses = 0
      window.inputSamples = []
      for (let index = 0; index < 10; index++) {
        const host = document.createElement('div')
        host.className = 'terminal-host'
        host.style.height = '220px'
        document.getElementById('panes').append(host)
        const terminal = new window.Terminal({
          ...window.getTerminalCompatibilityOptions(false),
          cols: 90,
          rows: 10,
          scrollback: 6000,
          fontFamily: 'Benchmark Mono',
          fontSize: 14,
          lineHeight: 1.05,
          cursorBlink: false,
          allowProposedApi: true,
          allowTransparency: true,
          theme: { foreground: '#dddddd', background: '#111111' }
        })
        terminal.loadAddon(new window.Unicode11Addon.Unicode11Addon())
        terminal.unicode.activeVersion = '11'
        adapters.push(window.registerTerminalEmojiWidths(terminal))
        terminal.open(host)
        const style = window.getComputedStyle(terminal.element)
        if (
          style.getPropertyValue('text-spacing-trim') !== 'space-all' ||
          style.getPropertyValue('text-autospace') !== 'no-autospace'
        )
          throw new Error('Production terminal typography CSS is not active')
        if (mode === 'webgl') {
          const addon = new window.WebglAddon.WebglAddon()
          addon.onContextLoss(() => window.contextLosses++)
          terminal.loadAddon(addon)
          addons.push(addon)
          if (terminal._core._renderService._renderer.value !== addon._renderer || !addon._renderer._gl) {
            throw new Error('WebGL addon did not replace the renderer')
          }
          const gl = addon._renderer._gl
          const debug = gl.getExtension('WEBGL_debug_renderer_info')
          const renderer = debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          if (!/Apple/.test(renderer) || /SwiftShader|llvmpipe|software/i.test(renderer)) {
            throw new Error('Expected hardware WebGL: ' + renderer)
          }
        }
        adapters.push(window.registerComparisonGridCalibration(terminal, mode))
        if (mode === 'dom') {
          if (!terminal.element.querySelector('.xterm-rows')) throw new Error('DOM renderer missing')
          adapters.push(window.registerTerminalSelectionRenderer(terminal))
          adapters.push(window.registerTerminalSymbolGlyphRenderer(terminal))
          adapters.push(window.registerTerminalBlockGlyphRenderer(terminal))
        }
        adapters.push(window.registerTerminalRenderCacheLimits(terminal))
        adapters.push(window.registerTerminalForegroundAdapter(terminal))
        adapters.push(
          new window.TerminalLogColorizer(
            terminal,
            Object.fromEntries(
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
          )
        )
        const state = {
          terminalRef: ref(terminal),
          pendingWriteRef: ref(''),
          pendingWriteCompletionsRef: ref([]),
          isWritingRef: ref(false),
          transcriptReplayGenerationRef: ref(0)
        }
        const { scheduleTerminalWrite } = window.createOutputActions(state)
        listeners.add((payload) => (payload.tabId === String(index) ? scheduleTerminalWrite(payload.chunk) : undefined))
        terminals.push(state)
      }
      window.snapshot = () => {
        const pages = addons.flatMap((addon) => addon._renderer?._charAtlas?.pages.map((page) => page.canvas) ?? [])
        return {
          grid: terminals[0] ? window.readComparisonGridMetrics(terminals[0].terminalRef.current) : null,
          sent: window.sent,
          acknowledged: window.acknowledged,
          pendingCharacters: terminals.reduce((sum, state) => sum + state.pendingWriteRef.current.length, 0),
          pendingCompletions: terminals.reduce(
            (sum, state) => sum + state.pendingWriteCompletionsRef.current.length,
            0
          ),
          pendingXterm: terminals.reduce(
            (sum, state) => sum + state.terminalRef.current._core._writeBuffer._pendingData,
            0
          ),
          domNodes: document.getElementsByTagName('*').length,
          contextLosses: window.contextLosses,
          coloringFailures: adapters.filter((adapter) => adapter.failed === true).length,
          // Per-context RGBA atlas estimate excludes buffers, drivers, and other GPU allocations.
          atlasTextureBytes: pages.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0),
          sharedAtlasCanvasBytes: [...new Set(pages)].reduce(
            (sum, canvas) => sum + canvas.width * canvas.height * 4,
            0
          ),
          inputCount: window.inputSamples.length,
          historyLines: terminals.map((state) => state.terminalRef.current.buffer.normal.length)
        }
      }
      function registerInputProbe(target) {
        let keyStarted = null
        target.element.addEventListener(
          'keydown',
          (event) => {
            keyStarted = { eventAt: event.timeStamp, handlerAt: performance.now() }
          },
          true
        )
        target.onData((data) => {
          if (!keyStarted) return
          const sample = keyStarted
          keyStarted = null
          target.write(data, () => {
            sample.parsedAt = performance.now()
            requestAnimationFrame(() => {
              window.inputSamples.push({
                dispatchMs: sample.handlerAt - sample.eventAt,
                parseMs: sample.parsedAt - sample.eventAt,
                nextFrameMs: performance.now() - sample.eventAt
              })
            })
          })
        })
        target.focus()
      }
      registerInputProbe(terminals[0].terminalRef.current)
      const deliver = window.createTerminalOutputDelivery(
        listeners,
        async () => window.acknowledged++,
        () => {}
      )
      window.startLoad = (total) => {
        window.sent = 0
        window.acknowledged = 0
        window.bytes = 0
        window.done = false
        const pump = () => {
          while (window.sent < total && window.sent - window.acknowledged < 4) {
            const index = window.sent++
            const chunk =
              '\x1b[H\x1b[2J' +
              Array.from(
                { length: 9 },
                (_, row) => `\x1b[${row + 1};1H\x1b[37m▢ 中文 tool ${index} ✻ ${'─'.repeat(55)}\x1b[0m`
              ).join('')
            window.bytes += new TextEncoder().encode(chunk).length
            deliver({ tabId: String(index % 10), deliveryId: index, chunk })
          }
          if (window.acknowledged < total) setTimeout(pump, 0)
          else requestAnimationFrame(() => requestAnimationFrame(() => (window.done = true)))
        }
        pump()
      }
      const history = Array.from(
        { length: 6500 },
        (_, index) => `history ${index} info service: completed 中文\r\n`
      ).join('')
      await Promise.all(
        terminals.map((state) => new Promise((resolve) => state.terminalRef.current.write(history, resolve)))
      )
      await frame()
      await frame()
      window.disposeTerminals = async () => {
        adapters.reverse().forEach((adapter) => adapter.dispose())
        terminals.forEach((state) => state.terminalRef.current.dispose())
        adapters.length = 0
        terminals.length = 0
        addons.length = 0
        listeners.clear()
        document.getElementById('panes').replaceChildren()
        await frame()
        await frame()
      }
    }, mode)
    await page.evaluate(() => window.startLoad(200))
    await page.waitForFunction(() => window.done, undefined, { timeout: 120000 })
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown })
    const sample = async () => {
      const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo')
      const pids = processInfo.map((process) => process.id)
      const rss = new Map(
        execFileSync('ps', ['-o', 'pid=,rss=', '-p', pids.join(',')], { encoding: 'utf8' })
          .trim()
          .split('\n')
          .map((line) => line.trim().split(/\s+/).map(Number))
      )
      const { metrics } = await cdp.send('Performance.getMetrics')
      const heap = await cdp.send('Runtime.getHeapUsage')
      return {
        at: performance.now(),
        heap,
        processes: processInfo.map((process) => ({ ...process, rssKiB: rss.get(process.id) ?? 0 })),
        metrics: Object.fromEntries(metrics.map(({ name, value }) => [name, value])),
        page: await page.evaluate(() => window.snapshot())
      }
    }
    const baseline = await sample()
    const samples = [baseline]
    await page.evaluate((total) => window.startLoad(total), batchCount)
    let finished = false
    const completion = page
      .waitForFunction(() => window.done, undefined, { timeout: 180000 })
      .then(() => (finished = true))
    const sampler = (async () => {
      while (!finished) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (!finished) {
          samples.push(await sample())
          if (samples.length % 10 === 0)
            console.log(
              JSON.stringify({
                event: 'progress',
                mode,
                slowdown,
                repetition,
                acknowledged: samples.at(-1).page.acknowledged
              })
            )
        }
      }
    })()
    const inputWallMs = []
    while (!finished) {
      const started = performance.now()
      await page.keyboard.press('x')
      inputWallMs.push(performance.now() - started)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    await completion
    const end = await sample()
    samples.push(end)
    await sampler
    const inputs = await page.evaluate(() => window.inputSamples)
    assert.ok(inputs.length >= 10, 'load must include enough real terminal key events')
    assert.ok(
      inputs.every(
        (value) => value.dispatchMs >= 0 && value.parseMs >= value.dispatchMs && value.nextFrameMs >= value.parseMs
      )
    )
    assert.equal(end.page.sent, batchCount)
    assert.equal(end.page.acknowledged, batchCount)
    assert.equal(end.page.pendingCharacters, 0)
    assert.equal(end.page.pendingCompletions, 0)
    assert.equal(end.page.pendingXterm, 0)
    assert.equal(end.page.contextLosses, 0)
    assert.equal(end.page.coloringFailures, 0)
    assert.deepEqual(errors, [])
    assert.ok(baseline.page.historyLines.every((length) => length === 6010))
    const cpu = {}
    for (const process of end.processes) {
      const previous = baseline.processes.find((entry) => entry.id === process.id)
      cpu[process.type] = (cpu[process.type] ?? 0) + process.cpuTime - (previous?.cpuTime ?? 0)
    }
    const rssTotal = (value, type) =>
      value.processes
        .filter((process) => !type || process.type === type)
        .reduce((sum, process) => sum + process.rssKiB / 1024, 0)
    const elapsedMs = end.at - baseline.at
    await cdp.send('HeapProfiler.collectGarbage')
    const retained = await sample()
    // Keep visual verification outside the measured phase.
    const screenshot = output.replace(/\.json$/, '') + `-${mode}-${slowdown}-${repetition}.png`
    await page.screenshot({ path: screenshot })
    await page.evaluate(() => window.disposeTerminals())
    await page.waitForTimeout(1000)
    await cdp.send('HeapProfiler.collectGarbage')
    const disposed = await sample()
    assert.ok(disposed.page.domNodes < 100)
    return {
      mode,
      gridCalibration: 'webgl-device-pixel-grid',
      screenshot,
      slowdown,
      repetition,
      chrome: browser.version(),
      gpu: gpu.auxAttributes.glRenderer,
      batchCount,
      outputBytes: await page.evaluate(() => window.bytes),
      elapsedMs,
      cpuSeconds: cpu,
      totalCpuSeconds: Object.values(cpu).reduce((sum, value) => sum + value, 0),
      taskSeconds: end.metrics.TaskDuration - baseline.metrics.TaskDuration,
      layoutSeconds: end.metrics.LayoutDuration - baseline.metrics.LayoutDuration,
      baselineRssMiB: rssTotal(baseline),
      peakRssMiB: Math.max(...samples.map((value) => rssTotal(value))),
      endRssMiB: rssTotal(end),
      retainedRssMiB: rssTotal(retained),
      disposedRssMiB: rssTotal(disposed),
      peakRendererRssMiB: Math.max(...samples.map((value) => rssTotal(value, 'renderer'))),
      peakGpuRssMiB: Math.max(...samples.map((value) => rssTotal(value, 'GPU'))),
      baselineHeapMiB: baseline.metrics.JSHeapUsedSize / 1048576,
      peakHeapMiB: Math.max(...samples.map((value) => value.metrics.JSHeapUsedSize / 1048576)),
      retainedHeapMiB: retained.metrics.JSHeapUsedSize / 1048576,
      disposedHeapMiB: disposed.metrics.JSHeapUsedSize / 1048576,
      baselineBackingMiB: baseline.heap.backingStorageSize / 1048576,
      peakBackingMiB: Math.max(...samples.map((value) => value.heap.backingStorageSize / 1048576)),
      disposedBackingMiB: disposed.heap.backingStorageSize / 1048576,
      peakAtlasTextureMiB: Math.max(...samples.map((value) => value.page.atlasTextureBytes / 1048576)),
      peakSharedAtlasCanvasMiB: Math.max(...samples.map((value) => value.page.sharedAtlasCanvasBytes / 1048576)),
      inputCount: inputs.length,
      inputLatency: Object.fromEntries(
        ['dispatchMs', 'parseMs', 'nextFrameMs'].map((key) => [
          key,
          {
            p50: percentile(
              inputs.map((value) => value[key]),
              0.5
            ),
            p95: percentile(
              inputs.map((value) => value[key]),
              0.95
            ),
            max: Math.max(...inputs.map((value) => value[key]))
          }
        ])
      ),
      inputTransportP95Ms: percentile(inputWallMs, 0.95),
      baseline: baseline.page,
      end: end.page,
      disposed: disposed.page,
      samples,
      inputs
    }
  } finally {
    await browser.close()
  }
}

for (const slowdown of slowdowns) {
  for (let repetition = 1; repetition <= repeats; repetition++) {
    for (const mode of repetition % 2 ? ['dom', 'webgl'] : ['webgl', 'dom']) {
      console.log(JSON.stringify({ event: 'start', mode, slowdown, repetition }))
      const result = await run(mode, slowdown, repetition)
      const peer = results.find(
        (row) => row.repetition === repetition && row.slowdown === slowdown && row.mode !== mode
      )
      if (peer)
        for (const key of ['measuredWidth', 'cellWidth', 'cellHeight', 'canvasWidth', 'canvasHeight', 'cols', 'rows'])
          assert.equal(result.baseline.grid[key], peer.baseline.grid[key], `paired grid ${key}`)
      results.push(result)
      writeFileSync(output, JSON.stringify({ addonVersion, results }, null, 2) + '\n')
      console.log(
        JSON.stringify({
          event: 'result',
          ...Object.fromEntries(Object.entries(result).filter(([key]) => !['samples', 'inputs'].includes(key)))
        })
      )
    }
  }
}
