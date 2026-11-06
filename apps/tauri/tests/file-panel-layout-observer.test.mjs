import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('layout observes sidebar replacement and collapse without terminal subtree mutations', () => {
  const observers = []
  class Observer {
    constructor(callback) {
      this.callback = callback
      observers.push(this)
    }
    observe(target, options) {
      this.target = target
      this.options = options
    }
    disconnect() {
      this.target = null
    }
  }
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL('../src/renderer/features/workspace/file-panel-layout-observer.ts', import.meta.url),
        'utf8'
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }
    ).outputText,
    {
      exports,
      MutationObserver: Observer,
      require: () => ({ FILE_PANEL_SNAP_TARGET_SELECTORS: { header: '[data-header]' } })
    }
  )
  const card = () => ({})
  const sidebar = () => ({
    collapsed: false,
    targets: [card(), card()],
    classList: { contains: () => currentSidebar.collapsed },
    querySelectorAll: () => currentSidebar.targets
  })
  let currentSidebar = sidebar()
  const root = { querySelector: () => currentSidebar }
  const observed = new Set()
  let layouts = 0
  const dispose = exports.observeFilePanelLayout(
    root,
    {
      observe: (node) => observed.add(node),
      unobserve: (node) => observed.delete(node)
    },
    () => layouts++
  )
  const shellObserver = observers.find((observer) => observer.target === root)
  const sidebarObserver = observers.find((observer) => observer.target === currentSidebar)
  assert.equal(shellObserver.options.subtree, undefined)
  assert.equal(sidebarObserver.options.subtree, true)
  assert.equal(observed.size, 3)
  const oldCard = currentSidebar.targets[0]
  const newCard = card()
  currentSidebar.targets[0] = newCard
  sidebarObserver.callback()
  assert.equal(observed.has(oldCard), false)
  assert.equal(observed.has(newCard), true)
  const oldSidebar = currentSidebar
  currentSidebar = sidebar()
  shellObserver.callback()
  assert.equal(observed.has(oldSidebar), false)
  assert.equal(sidebarObserver.target, currentSidebar)
  currentSidebar.collapsed = true
  sidebarObserver.callback()
  assert.equal(observed.size, 0)
  currentSidebar.collapsed = false
  sidebarObserver.callback()
  assert.equal(observed.size, 3)
  assert.equal(layouts, 4)
  dispose()
  assert.equal(observed.size, 0)
  assert.ok(observers.every((observer) => observer.target === null))
})
