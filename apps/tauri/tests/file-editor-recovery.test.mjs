import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function fixture() {
  let cursor = 0
  const cells = []
  let complete
  const reloads = []
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('../src/renderer/features/files/file-editor-recovery.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
      }
    ).outputText,
    {
      exports,
      window: {
        transterm: {
          undoFileChange: () =>
            new Promise((resolve) => {
              complete = resolve
            })
        }
      },
      require(name) {
        if (name === 'react')
          return {
            useState(value) {
              const index = cursor++
              if (!(index in cells)) cells[index] = value
              return [
                cells[index],
                (next) => {
                  cells[index] = next
                }
              ]
            },
            useRef(value) {
              const index = cursor++
              return (cells[index] ??= { current: value })
            }
          }
        if (name === 'react/jsx-runtime')
          return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
        if (name === '../../i18n') return { t: new Proxy({}, { get: (_, key) => String(key) }) }
        return { Button: 'button', ConfirmActionDialog: 'confirm', FileChangeDiff: 'diff' }
      }
    }
  )
  return {
    reloads,
    finish() {
      complete({ file: { target: { encoding: 'utf-8' } } })
    },
    render(content = 'saved') {
      cursor = 0
      return exports.FileEditorRecovery({
        file: { content: 'saved', encoding: 'utf-8', changeId: 'change' },
        content,
        encoding: 'utf-8',
        busy: false,
        onSave() {},
        onReload: (value) => reloads.push(value)
      })
    }
  }
}

function find(node, type) {
  if (node == null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean)
  return node.type === type ? node : find(node.props?.children, type)
}

test('file recovery cannot discard an already edited draft', () => {
  const state = fixture()
  assert.equal(find(state.render('unsaved text'), 'button').props.disabled, true)
})

test('typing while disk recovery is pending preserves the newer editor draft', async () => {
  const state = fixture()
  find(state.render(), 'button').props.onClick()
  find(state.render(), 'confirm').props.onConfirm()
  state.render('typed during recovery')
  state.finish()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(state.reloads, [])
  assert.equal(find(state.render('typed during recovery'), 'p').props.children, 'fileEditorUnsaved')
})
