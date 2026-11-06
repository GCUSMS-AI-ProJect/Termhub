import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/renderer/features/ai/ai-ssh-connection.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText,
  { exports }
)

function fixture() {
  const binding = { tabId: 'ssh-a', rootTabId: 'root-a', providerId: 'provider-a', sessionRevision: 'revision-a' }
  const target = {
    tabId: binding.tabId,
    rootTabId: binding.rootTabId,
    sessionRevision: binding.sessionRevision,
    sessionType: 'ssh',
    displayHost: 'qa.example',
    connected: true
  }
  const modes = []
  const requests = []
  let current = binding
  const options = {
    getBinding: () => current,
    async createPreview(input) {
      requests.push(input)
      return { target }
    },
    async setMode(mode) {
      modes.push(mode)
      return { mode, attachTerminalContext: mode !== 'pure-conversation' }
    },
    targetChangedMessage: 'target changed'
  }
  return { binding, target, modes, requests, options, setCurrent: (value) => (current = value) }
}

test('connecting AI validates the current SSH target before enabling collaboration', async () => {
  const f = fixture()
  const target = await exports.connectAiToCurrentSsh(f.options)
  assert.equal(target, f.target)
  assert.deepEqual(f.modes, ['semi-automatic'])
  assert.equal(f.requests[0].mode, 'L2')
  assert.equal(f.requests[0].tabId, 'ssh-a')
  assert.equal(f.requests[0].rootTabId, 'root-a')
  assert.equal(f.requests[0].providerId, 'provider-a')
})

test('failed context preview never grants remote operation mode', async () => {
  const f = fixture()
  f.options.createPreview = async () => null
  assert.equal(await exports.connectAiToCurrentSsh(f.options), null)
  assert.deepEqual(f.modes, [])
})

test('switching terminal, root pane, provider or revision during preview prevents access', async () => {
  for (const field of ['tabId', 'rootTabId', 'providerId', 'sessionRevision']) {
    const f = fixture()
    f.options.createPreview = async () => {
      f.setCurrent({ ...f.binding, [field]: 'changed' })
      return { target: f.target }
    }
    await assert.rejects(exports.connectAiToCurrentSsh(f.options), /target changed/)
    assert.deepEqual(f.modes, [])
  }
})

test('a preview for a different, local or disconnected target cannot enable SSH access', async () => {
  for (const patch of [
    { tabId: 'other' },
    { rootTabId: 'other' },
    { sessionRevision: 'other' },
    { sessionType: 'local' },
    { connected: false }
  ]) {
    const f = fixture()
    Object.assign(f.target, patch)
    await assert.rejects(exports.connectAiToCurrentSsh(f.options), /target changed/)
    assert.deepEqual(f.modes, [])
  }
})

test('a target switch while enabling mode rolls back to ordinary chat', async () => {
  const f = fixture()
  const setMode = f.options.setMode
  f.options.setMode = async (mode) => {
    const result = await setMode(mode)
    f.setCurrent(null)
    return result
  }
  await assert.rejects(exports.connectAiToCurrentSsh(f.options), /target changed/)
  assert.deepEqual(f.modes, ['semi-automatic', 'pure-conversation'])
})

test('mode update failure and missing SSH binding do not report a successful connection', async () => {
  const f = fixture()
  f.options.setMode = async () => null
  assert.equal(await exports.connectAiToCurrentSsh(f.options), null)
  f.setCurrent(null)
  await assert.rejects(exports.connectAiToCurrentSsh(f.options), /target changed/)
})
