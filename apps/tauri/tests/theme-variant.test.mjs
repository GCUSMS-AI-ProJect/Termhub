import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as core from '@transterm/core'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('../src/renderer/app/theme-variant.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  {
    exports,
    require: (name) => {
      assert.equal(name, '@transterm/core')
      return core
    }
  }
)
const { deriveThemeVariant, repairThemeVariant, getSavedThemeConfig } = exports
const plain = (value) => JSON.parse(JSON.stringify(value))
const normalized = (value) => core.normalizeThemeConfig(value, value.variant)

for (const [name, factory] of [
  ['TermHub', core.createDefaultThemeConfig],
  ['Codex', core.createCodexThemeConfig]
]) {
  test(`${name}: font-only customization follows both palettes through repeated switches`, () => {
    const source = normalized(factory('dark'))
    source.codeThemeId = 'custom'
    source.theme.fonts.ui = 'Noto Sans SC'
    source.theme.fonts.code = 'Cascadia Code'
    const before = plain(source)
    let result = source
    for (const variant of ['light', 'dark', 'light', 'dark']) {
      result = deriveThemeVariant(result, variant)
      const expected = normalized(factory(variant))
      expected.codeThemeId = 'custom'
      expected.theme.fonts = source.theme.fonts
      assert.deepEqual(plain(result), plain(expected))
    }
    assert.deepEqual(plain(source), before)
  })
}

test('individual semantic and terminal edits do not pin their entire dark palettes', () => {
  const source = normalized(core.createCodexThemeConfig('dark'))
  source.codeThemeId = 'custom'
  source.theme.semanticColors.secondary = '#B73158'
  source.theme.terminal.ansi.red = '#AB1234'
  source.theme.terminal.search.activeMatchBorder = '#BC5678'
  const result = deriveThemeVariant(source, 'light')
  const expected = normalized(core.createCodexThemeConfig('light'))
  assert.equal(result.theme.semanticColors.secondary, '#B73158')
  assert.equal(result.theme.semanticColors.textSecondary, expected.theme.semanticColors.textSecondary)
  assert.equal(result.theme.terminal.ansi.red, '#AB1234')
  assert.equal(result.theme.terminal.ansi.white, expected.theme.terminal.ansi.white)
  assert.equal(result.theme.terminal.background, expected.theme.terminal.background)
  assert.equal(result.theme.terminal.search.activeMatchBorder, '#BC5678')
})

test('repairs saved opposite-mode surfaces without changing fonts or terminal colors', () => {
  const source = normalized(core.createCodexThemeConfig('dark'))
  source.codeThemeId = 'custom'
  source.theme.fonts.ui = 'Noto Sans SC'
  const surfaces = core.createCodexThemeConfig('light').theme
  for (const key of Object.keys(surfaces).filter((key) => key.startsWith('surface'))) source.theme[key] = surfaces[key]
  const result = repairThemeVariant(source)
  assert.equal(result.theme.surface, '#111111')
  assert.equal(result.theme.surfaceSidebar, '#181818')
  assert.equal(result.theme.fonts.ui, 'Noto Sans SC')
  assert.deepEqual(plain(result.theme.terminal), plain(source.theme.terminal))
  const saved = getSavedThemeConfig({ id: 'test', name: 'test', config: source, variants: { dark: source } }, 'dark')
  assert.equal(saved.theme.surface, '#111111')
})

test('preserves explicit custom surfaces, ink and token overrides', () => {
  const source = normalized(core.createCodexThemeConfig('dark'))
  source.codeThemeId = 'custom'
  source.theme.surface = '#203040'
  source.theme.ink = '#EDDCBA'
  source.theme.overrides = { '--ref-accent': '#123456' }
  const result = deriveThemeVariant(source, 'light')
  assert.equal(result.theme.surface, '#203040')
  assert.equal(result.theme.ink, '#EDDCBA')
  assert.deepEqual(plain(result.theme.overrides), plain(source.theme.overrides))
})
