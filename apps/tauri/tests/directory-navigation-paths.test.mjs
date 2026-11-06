import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('../src/renderer/app/app-utils.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  {
    exports,
    require: (name) => {
      assert.equal(name, '../i18n')
      return { t: {} }
    }
  }
)
const { withParentRow, WINDOWS_DRIVES_PATH } = exports
const parent = (path, root) => withParentRow(path, [], root)[0]?.path

test('Windows parent navigation moves one level with mixed or trailing separators', () => {
  assert.equal(parent('D:/workspace/project\\child'), 'D:/workspace/project')
  assert.equal(parent('D:\\workspace/project/child/'), 'D:\\workspace/project')
  assert.equal(parent('D:\\workspace\\child\\'), 'D:\\workspace')
  assert.equal(parent('D:/child'), 'D:\\')
})

test('Windows drive roots return to This PC and This PC has no parent', () => {
  for (const path of ['C:', 'C:/', 'C:\\']) assert.equal(parent(path), WINDOWS_DRIVES_PATH)
  assert.equal(parent(WINDOWS_DRIVES_PATH), undefined)
})

test('POSIX parent navigation preserves backslashes in names and stops at root', () => {
  assert.equal(parent('/srv/project\\name/child'), '/srv/project\\name')
  assert.equal(parent('/srv/project\\name'), '/srv')
  assert.equal(parent('/srv/project/'), '/srv')
  assert.equal(parent('/'), undefined)
})

test('share navigation keeps its existing root boundary and parent rows preserve directory entries', () => {
  assert.equal(parent('\\\\server\\share\\child'), '\\\\server\\share')
  assert.equal(parent('\\\\server\\share', '\\\\server\\share'), undefined)
  const child = { path: '/srv/child', name: 'child', type: 'folder', modified: '', size: '-' }
  const rows = withParentRow('/srv', [child])
  assert.equal(rows[0].path, '/')
  assert.equal(rows[0].name, '..')
  assert.equal(rows[1], child)
})
