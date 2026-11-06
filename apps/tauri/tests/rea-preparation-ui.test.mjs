import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function controlFixture() {
  let cursor = 0
  const cells = []
  let sequence = 0
  const calls = []
  const react = {
    useEffect() {},
    useLayoutEffect() {},
    useId: () => 'rea-control',
    useRef(value) {
      const index = cursor++
      return (cells[index] ??= { current: value })
    },
    useState(value) {
      const index = cursor++
      if (!(index in cells)) cells[index] = value
      return [
        cells[index],
        (next) => {
          cells[index] = typeof next === 'function' ? next(cells[index]) : next
        }
      ]
    }
  }
  const api = {
    setReaEnabled(input, progress) {
      return new Promise((resolve) => calls.push({ input, progress, resolve }))
    },
    cancelReaCheck: async () => {}
  }
  const t = new Proxy({}, { get: (_, key) => String(key) })
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('../src/renderer/features/ai/ai-rea-control.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
      }
    ).outputText,
    {
      exports,
      window: { transterm: api },
      document: { body: {} },
      crypto: { randomUUID: () => `request-${++sequence}` },
      require(name) {
        if (name === 'react') return react
        if (name === 'react-dom') return { createPortal: (content) => content }
        if (name === 'react/jsx-runtime')
          return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
        if (name === '../../i18n') return { t, formatMessage: (value) => value }
        return { Button: 'button', AppIcon: 'svg', Tooltip: 'tooltip', VerticalScrollbar: 'scrollbar' }
      }
    }
  )
  return {
    calls,
    render() {
      cursor = 0
      return exports.AiReaControl({
        activeTab: { id: 'ssh', sessionType: 'ssh' },
        rootTab: { id: 'ssh' },
        activeSession: { connected: true, aiSessionRevision: '1' },
        mode: 'semi-automatic',
        isStreaming: false,
        onAnalyze() {}
      })
    }
  }
}

function find(tree, predicate) {
  if (tree == null) return undefined
  if (Array.isArray(tree)) return tree.map((item) => find(item, predicate)).find(Boolean)
  if (typeof tree !== 'object') return undefined
  return predicate(tree) ? tree : find(tree.props?.children, predicate)
}

test('REA shows server preparation stages and ignores progress from a cancelled request', async () => {
  const fixture = controlFixture()
  const toggle = () =>
    find(fixture.render(), (node) => node.type === 'button' && node.props.className?.includes('ai-rea-toggle'))
  toggle().props.onClick()
  assert.equal(fixture.calls.length, 1)
  const enabling = fixture.calls[0]
  enabling.progress({ requestId: enabling.input.requestId, stage: 'preparing-package' })
  assert.equal(find(fixture.render(), (node) => node.props?.role === 'status').props.children, 'reaStageDownloading')
  enabling.progress({ requestId: 'another-window', stage: 'starting' })
  assert.equal(find(fixture.render(), (node) => node.props?.role === 'status').props.children, 'reaStageDownloading')
  toggle().props.onClick()
  const disabling = fixture.calls[1]
  assert.equal(disabling.input.enabled, false)
  enabling.progress({ requestId: enabling.input.requestId, stage: 'ready' })
  enabling.resolve({ enabled: true, status: { ready: true, toolCount: 207, engines: [] } })
  disabling.resolve({ enabled: false, status: null })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(toggle().props['aria-pressed'], false)
  assert.equal(toggle().props['aria-busy'], false)
})
