import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/renderer/components/terminal-lifecycle-input.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }
  ).outputText,
  {
    exports,
    require(name) {
      if (name.endsWith('terminal-input-compat'))
        return {
          createTerminalInputCompatibility: () => ({
            handleKeyEvent: () => null,
            markDataEmitted() {},
            filterCompositionData: (value) => value,
            dispose() {}
          })
        }
      return { isTerminalResponseSequence: () => false, isFocusTrackingSequence: () => false }
    }
  }
)

function fixture(imagePresent, connected = true) {
  let onData
  const sent = [],
    probes = []
  const runtime = {
    terminal: {
      attachCustomKeyEventHandler() {},
      onData(callback) {
        onData = callback
        return { dispose() {} }
      }
    },
    isActiveRef: { current: true },
    connectedRef: { current: connected },
    connectingRef: { current: false },
    replayingTranscriptRef: { current: false },
    serialTransferBusyRef: { current: false },
    writeTerminalInput: (value) => sent.push(value),
    clearEphemeralHighlight() {},
    setContextMenu() {},
    requestReconnect() {},
    async runPaste(imageOnly, onNoImage) {
      probes.push(imageOnly)
      if (imagePresent) runtime.writeTerminalInput('/tmp/image.png ')
      else onNoImage()
    }
  }
  exports.registerTerminalInputHandlers(runtime)
  return { send: (value) => onData(value), sent, probes }
}

test('raw Ctrl+V from native or IME paths uploads instead of reaching remote X11', () => {
  const f = fixture(true)
  f.send('\u0016')
  assert.deepEqual(f.probes, [true])
  assert.deepEqual(f.sent, ['/tmp/image.png '])
})
test('raw Ctrl+V without an image forwards once without recursive probing', () => {
  const f = fixture(false)
  f.send('\u0016')
  assert.deepEqual(f.probes, [true])
  assert.deepEqual(f.sent, ['\u0016'])
})
test('ordinary terminal input and disconnected sessions retain existing routing', () => {
  const f = fixture(true)
  f.send('hello')
  assert.deepEqual(f.probes, [])
  assert.deepEqual(f.sent, ['hello'])
  const offline = fixture(true, false)
  offline.send('\u0016')
  assert.deepEqual(offline.probes, [])
  assert.deepEqual(offline.sent, [])
})
