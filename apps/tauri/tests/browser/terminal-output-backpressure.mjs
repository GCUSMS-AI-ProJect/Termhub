/* global window, document */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { loadTypeScript } from './helpers/load-typescript.mjs'

const require = createRequire(import.meta.url)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const engine = process.env.PLAYWRIGHT_ENGINE === 'webkit' ? webkit : chromium
const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')
const browser = await engine.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
let progressTimer
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
  const cpuSlowdown = Number(process.env.TRANSTERM_CPU_SLOWDOWN || 1)
  if (cpuSlowdown > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown })
  }
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setContent(
    '<input id="input"><button id="button">click</button><output id="clicks">0</output><div id="panes" style="display:grid;grid-template-columns:repeat(2,1fr)"></div>'
  )
  await page.addStyleTag({ path: root + '/node_modules/@xterm/xterm/css/xterm.css' })
  await page.addScriptTag({ path: root + '/node_modules/@xterm/xterm/lib/xterm.js' })
  for (const [file, symbol] of [
    ['bridge/events/terminal-output', 'createTerminalOutputDelivery'],
    ['renderer/xterm-adapters/terminal-symbol-glyph-renderer', 'registerTerminalSymbolGlyphRenderer'],
    ['renderer/xterm-adapters/terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer'],
    ['renderer/xterm-adapters/terminal-selection-renderer', 'registerTerminalSelectionRenderer'],
    ['renderer/xterm-adapters/terminal-foreground-adapter', 'registerTerminalForegroundAdapter'],
    ['renderer/xterm-adapters/terminal-render-cache', 'registerTerminalRenderCacheLimits'],
    ['renderer/xterm-adapters/terminal-log-colorizer', 'TerminalLogColorizer']
  ])
    await loadTypeScript(page, root + '/apps/tauri/src/' + file + '.ts', symbol)
  const actions = ts.transpileModule(
    readFileSync(root + '/apps/tauri/src/renderer/components/terminal-view-actions.ts', 'utf8').replaceAll(
      'import.meta.env.DEV',
      'false'
    ),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }
  ).outputText
  await page.addScriptTag({
    content: `(() => {
    const exports = {};
    const require = (name) => name === 'react' ? {useCallback: callback => callback} : name === './terminal-view-utils' ? {TERMINAL_WRITE_CHUNK_SIZE: 16384, splitPaneShortcutsForPlatform: () => ({})} : {};
    ${actions}
    window.createOutputActions = exports.useTerminalViewActions;
  })()`
  })
  await page.evaluate(() => {
    let clicks = 0
    document.getElementById('button').onclick = () => (document.getElementById('clicks').textContent = String(++clicks))
    const ref = (current) => ({ current })
    const listeners = new Set()
    const terminals = []
    for (let index = 0; index < 10; index++) {
      const host = document.createElement('div')
      host.style.height = '190px'
      document.getElementById('panes').append(host)
      const terminal = new window.Terminal({
        cols: 90,
        rows: 10,
        cursorBlink: false,
        allowProposedApi: true,
        minimumContrastRatio: 4.5
      })
      terminal.open(host)
      for (const name of [
        'registerTerminalSymbolGlyphRenderer',
        'registerTerminalBlockGlyphRenderer',
        'registerTerminalSelectionRenderer',
        'registerTerminalRenderCacheLimits',
        'registerTerminalForegroundAdapter'
      ])
        window[name](terminal)
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
        ].map((key) => [key, '#dddddd'])
      )
      new window.TerminalLogColorizer(terminal, palette)
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
    window.sent = 0
    window.acknowledged = 0
    window.maxPending = 0
    window.done = false
    const deliver = window.createTerminalOutputDelivery(
      listeners,
      async () => {
        window.acknowledged++
      },
      () => {}
    )
    window.sampleOutputProgress = () => ({
      sent: window.sent,
      acknowledged: window.acknowledged,
      pendingCharacters: terminals.reduce((sum, state) => sum + state.pendingWriteRef.current.length, 0),
      pendingCompletions: terminals.reduce((sum, state) => sum + state.pendingWriteCompletionsRef.current.length, 0),
      pendingXterm: terminals.reduce(
        (sum, state) => sum + state.terminalRef.current._core._writeBuffer._pendingData,
        0
      ),
      domNodeCount: document.getElementsByTagName('*').length
    })
    window.startLoad = (total) => {
      const pump = () => {
        while (window.sent < total && window.sent - window.acknowledged < 4) {
          const index = window.sent++
          deliver({
            tabId: String(index % 10),
            deliveryId: index,
            chunk:
              '\x1b[H\x1b[2J' +
              Array.from(
                { length: 9 },
                (_, row) => `\x1b[${row + 1};1H\x1b[37m▢ 中文 tool ${index} ✻ ${'─'.repeat(55)}\x1b[0m`
              ).join('')
          })
          window.maxPending = Math.max(window.maxPending, window.sent - window.acknowledged)
        }
        if (window.acknowledged < total) setTimeout(pump, 0)
        else {
          window.pendingCharacters = terminals.reduce((sum, state) => sum + state.pendingWriteRef.current.length, 0)
          window.pendingCompletions = terminals.reduce(
            (sum, state) => sum + state.pendingWriteCompletionsRef.current.length,
            0
          )
          window.done = true
        }
      }
      pump()
    }
    window.testRecovery = async () => {
      const state = terminals[0]
      const terminal = state.terminalRef.current
      const originalWrite = terminal._core.write
      terminal._core.write = () => {
        terminal._core.write = originalWrite
        throw new Error('injected enqueue failure')
      }
      // Four deliveries to the same view used to exhaust every native credit after one failure.
      for (let index = 0; index < 4; index++) {
        deliver({ tabId: '0', deliveryId: window.sent++, chunk: 'recovery probe\r\n' })
      }
      while (window.sent !== window.acknowledged) await new Promise((resolve) => setTimeout(resolve, 10))
      const buffer = terminal.buffer.normal
      const getLine = buffer.getLine
      buffer.getLine = function () {
        buffer.getLine = getLine
        throw new Error('injected recoloring failure')
      }
      deliver({ tabId: '0', deliveryId: window.sent++, chunk: 'coloring probe\r\n' })
      while (window.sent !== window.acknowledged) await new Promise((resolve) => setTimeout(resolve, 10))
      deliver({ tabId: '0', deliveryId: window.sent++, chunk: 'after failure\r\n' })
      while (window.sent !== window.acknowledged) await new Promise((resolve) => setTimeout(resolve, 10))
      if (
        state.isWritingRef.current ||
        state.pendingWriteCompletionsRef.current.length ||
        state.pendingWriteRef.current
      ) {
        throw new Error('parser work retained after recovery')
      }
      if (terminal.markers.length) throw new Error('colorizer marker retained after recovery')
      window.recoveredDeliveries = window.acknowledged
      window.sent = window.acknowledged = 0
    }
  })
  const total = Number(process.env.TRANSTERM_BATCH_COUNT || 4000)
  assert.ok(Number.isSafeInteger(total) && total > 0)
  await page.evaluate(() =>
    Promise.race([
      window.testRecovery(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('display credit did not recover')), 30000))
    ])
  )
  const loadStarted = performance.now()
  let reporting = false
  progressTimer = setInterval(() => {
    if (reporting) return
    reporting = true
    void page
      .evaluate(() => window.sampleOutputProgress())
      .then((progress) =>
        console.log(
          JSON.stringify({ event: 'progress', elapsedMs: Math.round(performance.now() - loadStarted), ...progress })
        )
      )
      .catch(() => {})
      .finally(() => {
        reporting = false
      })
  }, 10000)
  await page.evaluate((total) => window.startLoad(total), total)
  const timings = []
  for (let index = 0; index < 10; index++) {
    const started = performance.now()
    await page.locator('#input').fill(`输入 ${index}`)
    await page.locator('#button').click()
    timings.push(Math.round(performance.now() - started))
    await page.waitForTimeout(100)
  }
  await page.waitForFunction(() => window.done, undefined, { timeout: 120000 })
  const result = await page.evaluate(() => ({
    recoveredDeliveries: window.recoveredDeliveries,
    sent: window.sent,
    acknowledged: window.acknowledged,
    maxPending: window.maxPending,
    pendingCharacters: window.pendingCharacters,
    pendingCompletions: window.pendingCompletions,
    clicks: document.getElementById('clicks').textContent,
    input: document.getElementById('input').value
  }))
  assert.equal(result.recoveredDeliveries, 6)
  assert.equal(result.sent, total)
  assert.equal(result.acknowledged, total)
  assert.equal(result.maxPending, 4)
  assert.equal(result.pendingCharacters, 0)
  assert.equal(result.pendingCompletions, 0)
  assert.equal(result.clicks, '10')
  assert.equal(result.input, '输入 9')
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({ ...result, elapsedMs: Math.round(performance.now() - loadStarted), inputAndClickMs: timings })
  )
} finally {
  clearInterval(progressTimer)
  await browser.close()
}
