import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('interaction timing aggregates only keyboard/click durations and cleans up', () => {
  let consume
  let disconnected = false
  const document = { hidden: false }
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('../src/renderer/lib/renderer-interaction-performance.ts', import.meta.url), 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }
    ).outputText,
    {
      exports,
      document,
      PerformanceObserver: class {
        static supportedEntryTypes = ['event']
        constructor(callback) {
          consume = callback
        }
        observe(options) {
          assert.equal(options.durationThreshold, 16)
        }
        disconnect() {
          disconnected = true
        }
      }
    }
  )
  const metrics = exports.observeInteractionPerformance()
  const entry = { name: 'keydown', startTime: 10, processingStart: 510, duration: 1008, key: 'private' }
  consume({ getEntries: () => [entry, { ...entry, name: 'pointermove', duration: 9000 }] })
  assert.equal(metrics.snapshot().samples, 1)
  assert.equal(metrics.snapshot().maxInputDelayMs, 500)
  assert.equal(metrics.snapshot().maxDurationMs, 1008)
  assert.ok(!JSON.stringify(metrics.snapshot()).includes('private'))
  document.hidden = true
  consume({ getEntries: () => [{ ...entry, duration: 5000 }] })
  assert.equal(metrics.snapshot().maxDurationMs, 1008)
  metrics.reset()
  assert.equal(metrics.snapshot().samples, 0)
  metrics.dispose()
  assert.equal(disconnected, true)
})

test('missing Event Timing is explicitly reported without starting an observer', () => {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('../src/renderer/lib/renderer-interaction-performance.ts', import.meta.url), 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }
    ).outputText,
    { exports }
  )
  const metrics = exports.observeInteractionPerformance()
  assert.equal(metrics.snapshot().supported, false)
  assert.equal(metrics.snapshot().maxDurationMs, undefined)
  metrics.reset()
  metrics.dispose()
})
