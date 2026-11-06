import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/renderer/components/terminal-view-actions.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source.replaceAll('import.meta.env.DEV', 'false'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

function fixture(image, text = '') {
  const inputs = []
  const pasted = [],
    errors = [],
    exports = {}
  const terminal = {
    focus() {},
    hasSelection: () => false,
    paste: (value) => pasted.push(value),
    input: (value) => inputs.push(value)
  }
  const options = {
    terminalRef: { current: terminal },
    tabIdRef: { current: 'local-1' },
    searchAddonRef: { current: null },
    onStatusRef: { current: (error) => errors.push(error) }
  }
  const fallback = new Proxy({}, { get: (_, key) => (key === 'useCallback' ? (fn) => fn : () => ({})) })
  vm.runInNewContext(code, {
    exports,
    window: { transterm: { prepareTerminalImagePaste: image } },
    require: (name) => (name.endsWith('app-utils') ? { readClipboardText: async () => text } : fallback)
  })
  return { ...exports.useTerminalViewActions(options), options, pasted, errors, inputs }
}

test('image paste inserts exactly the prepared path without submitting Enter', async () => {
  const f = fixture(async (tab) => {
    assert.equal(tab, 'local-1')
    return '"C:/cache/screenshot.png" '
  })
  await f.runPaste()
  assert.deepEqual(f.pasted, ['"C:/cache/screenshot.png" '])
})

test('ordinary text survives unavailable image clipboard providers', async () => {
  const f = fixture(async () => {
    throw new Error('image clipboard unavailable')
  }, 'hello\nworld')
  await f.runPaste()
  assert.deepEqual(f.pasted, ['hello\nworld'])
})

test('failed image upload reports an error and never inserts a local path', async () => {
  const f = fixture(async () => {
    throw new Error('upload failed')
  })
  await f.runPaste()
  assert.deepEqual(f.pasted, [])
  assert.match(String(f.errors[0]), /upload failed/)
})

test('switching tabs while preparing an image does not paste into the new terminal', async () => {
  let finish
  const f = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = f.runPaste()
  f.options.tabIdRef.current = 'ssh-2'
  finish('/remote/image.png')
  await pending
  assert.deepEqual(f.pasted, [])
})

test('Ctrl+V consumes image paste instead of forwarding the remote clipboard shortcut', async () => {
  const f = fixture(async () => "'/remote/screenshot.png' ")
  await f.runPaste(true)
  assert.deepEqual(f.pasted, ["'/remote/screenshot.png' "])
  assert.deepEqual(f.inputs, [])
})

test('a literal control fallback bypasses xterm image probing and forwards only once', async () => {
  const f = fixture(async () => null)
  let forwarded = 0
  await f.runPaste(true, () => {
    forwarded += 1
  })
  assert.equal(forwarded, 1)
  assert.deepEqual(f.inputs, [])
  assert.deepEqual(f.pasted, [])
})

test('Ctrl+V without an image preserves the terminal control key, not clipboard text', async () => {
  const f = fixture(async () => null, 'must not paste text')
  await f.runPaste(true)
  assert.deepEqual(f.pasted, [])
  assert.deepEqual(f.inputs, ['\u0016'])
})

test('Ctrl+V upload failure does not trigger the remote X11 clipboard reader', async () => {
  const f = fixture(async () => {
    throw new Error('upload failed')
  }, 'clipboard metadata')
  await f.runPaste(true)
  assert.deepEqual(f.pasted, [])
  assert.deepEqual(f.inputs, [])
  assert.match(String(f.errors[0]), /upload failed/)
})
