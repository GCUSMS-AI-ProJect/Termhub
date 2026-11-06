import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function fixture({ supportsLongTasks = false } = {}) {
  let now = 0
  let callback
  let reset
  let cleared = false
  let longTaskCallback
  let observerDisconnected = false
  const calls = []
  let output = null
  let interaction = { supported: false, samples: 0 }

  const document = {
    hidden: false,
    hasFocus: () => true,
    querySelectorAll: () => Array(10),
    getElementsByTagName: () => Array(8000),
    addEventListener: (_, listener) => {
      reset = listener
    },
    removeEventListener: (_, listener) => {
      assert.equal(listener, reset)
      reset = undefined
    }
  }
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('../src/renderer/lib/renderer-performance-log.ts', import.meta.url), 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }
    ).outputText,
    {
      exports,
      document,
      performance: { now: () => now, memory: { usedJSHeapSize: 1234, totalJSHeapSize: 4567 } },
      PerformanceObserver: supportsLongTasks
        ? class {
            static supportedEntryTypes = ['longtask']
            constructor(callback) {
              longTaskCallback = callback
            }
            observe(options) {
              assert.equal(options.type, 'longtask')
            }
            disconnect() {
              observerDisconnected = true
            }
          }
        : undefined,
      window: {
        transterm: { appVersion: '2.2.31', platform: 'win32' },
        __TAURI_INTERNALS__: { callbacks: new Map([[1, () => {}]]) },
        setInterval: (listener, interval) => {
          assert.equal(interval, 1000)
          callback = listener
          return 7
        },
        clearInterval: (timer) => {
          assert.equal(timer, 7)
          cleared = true
        }
      },
      require: (name) =>
        name.includes('terminal-output')
          ? {
              getTerminalOutputProgress: () => output
            }
          : name.includes('renderer-interaction-performance')
            ? {
                observeInteractionPerformance: () => ({
                  snapshot: () => interaction,
                  reset: () => {
                    interaction = { supported: false, samples: 0 }
                  },
                  dispose: () => {}
                })
              }
            : {
                DIAGNOSTIC_SCOPES: { performance: 'renderer:performance' },
                writeDiagnosticLog: (...args) => calls.push(args)
              }
    }
  )
  const dispose = exports.installRendererPerformanceLogging()
  return {
    calls,
    setOutput: (value) => {
      output = value
    },
    setInteraction: (value) => {
      interaction = value
    },
    document,
    dispose,
    get cleared() {
      return cleared
    },
    get observerDisconnected() {
      return observerDisconnected
    },
    longTasks: (...durations) => longTaskCallback({ getEntries: () => durations.map((duration) => ({ duration })) }),
    tick: (elapsed) => {
      now += elapsed
      callback()
    },
    visibility: () => reset()
  }
}

test('recovered foreground stalls log WARN without an exception and are rate limited', () => {
  const f = fixture()
  f.tick(1000)
  assert.equal(f.calls.length, 0)
  f.tick(5000)
  assert.equal(f.calls[0][0], 'WARN')
  assert.equal(f.calls[0][1], 'renderer:performance')
  assert.equal(JSON.parse(f.calls[0][2]).elapsedMs, 5000)
  f.tick(5000)
  assert.equal(f.calls.length, 1)
  f.tick(30000)
  assert.equal(f.calls.length, 2)
  f.dispose()
  assert.equal(f.cleared, true)
})

test('hidden timer throttling and the transition back to foreground are ignored', () => {
  const f = fixture()
  f.document.hidden = true
  f.tick(60000)
  f.document.hidden = false
  f.visibility()
  f.tick(1000)
  assert.equal(f.calls.length, 0)
  f.tick(4000)
  assert.equal(f.calls.length, 1)
  f.dispose()
})

test('minute health reports include bounded counters without terminal contents', () => {
  const f = fixture()
  for (let index = 0; index < 60; index++) f.tick(1000)
  assert.equal(f.calls.length, 1)
  const health = JSON.parse(f.calls[0][2])
  assert.equal(health.event, 'renderer-health')
  assert.equal(health.uptimeMs, 60000)
  assert.equal(health.usedJSHeapBytes, 1234)
  assert.equal(health.totalJSHeapBytes, 4567)
  assert.equal(health.ipcCallbackCount, 1)
  assert.equal(health.terminalCount, 10)
  assert.equal(health.domNodeCount, 8000)
  assert.equal(health.maxEventLoopGapMs, 1000)
  assert.equal(health.longTaskCount, undefined)
  f.dispose()
})

test('long task summaries reset each minute and across visibility, then disconnect', () => {
  const f = fixture({ supportsLongTasks: true })
  f.longTasks(50, 123)
  for (let index = 0; index < 60; index++) f.tick(1000)
  const health = JSON.parse(f.calls[0][2])
  assert.equal(health.longTaskCount, 2)
  assert.equal(health.longTaskTotalMs, 173)
  assert.equal(health.maxLongTaskMs, 123)
  f.document.hidden = true
  f.longTasks(999)
  f.document.hidden = false
  f.visibility()
  for (let index = 0; index < 60; index++) f.tick(1000)
  assert.equal(JSON.parse(f.calls[1][2]).longTaskCount, 0)
  f.dispose()
  assert.equal(f.observerDisconnected, true)
})

test('stalled output and slow interactions report bounded summaries on the existing heartbeat', () => {
  const f = fixture()
  f.setOutput({ pendingBatches: 4, busyForMs: 6000, lastReceivedDeliveryId: 8 })
  f.setInteraction({ supported: true, samples: 2, maxInputDelayMs: 1200, maxDurationMs: 1504 })
  f.tick(1000)
  const report = JSON.parse(f.calls[0][2])
  assert.equal(report.event, 'renderer-progress-slow')
  assert.equal(report.terminalOutput.lastReceivedDeliveryId, 8)
  assert.equal(report.interaction.maxInputDelayMs, 1200)
  for (let i = 0; i < 20; i++) f.tick(1000)
  assert.equal(f.calls.length, 1)
  f.setOutput({ pendingBatches: 4, busyForMs: 30000, sinceLastParsedMs: 1 })
  f.setInteraction({ supported: false, samples: 0 })
  for (let i = 0; i < 39; i++) f.tick(1000)
  assert.equal(f.calls.length, 2)
  assert.equal(JSON.parse(f.calls[1][2]).event, 'renderer-health')
  f.dispose()
})

test('new output after a long idle period is not mistaken for a stalled parse', () => {
  const f = fixture()
  f.setOutput({ pendingBatches: 1, busyForMs: 100, sinceLastParsedMs: 60000 })
  f.tick(1000)
  assert.equal(f.calls.length, 0)
  f.dispose()
})
