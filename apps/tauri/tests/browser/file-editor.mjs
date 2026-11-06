// Real Monaco and FileEditorModal; only the desktop preference/save boundary is stubbed.
/* global window, document */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = mkdtempSync(join(root, '.file-editor-fixture-'))
writeFileSync(join(directory, 'index.html'), '<div id="root"></div><script type="module" src="./fixture.tsx"></script>')
writeFileSync(
  join(directory, 'fixture.tsx'),
  `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { FileEditorModal } from '../src/renderer/features/files/file-editor-modal'
import { setLocale } from '../src/renderer/i18n'
import '../src/renderer/styles/index.css'
setLocale('enUS')
window.MonacoEnvironment = { getWorker: () => new EditorWorker() }
function Fixture() {
  const [file, setFile] = useState({ path: '/fixture/test.txt', name: 'test.txt', source: 'remote', content: '', encoding: 'utf-8' })
  const [busy, setBusy] = useState(true)
  const [platform, setPlatform] = useState('unknown')
  const [theme, setTheme] = useState('default-dark')
  const [revision, setRevision] = useState(0)
  const [dirty, setDirty] = useState(false)
  window.fixture = {
    model: () => monaco.editor.getModels()[0],
    editor: () => monaco.editor.getEditors()[0],
    whitespace: () => monaco.editor.getEditors()[0].getOption(monaco.editor.EditorOption.renderWhitespace),
    load: (content) => flushSync(() => { setFile({ ...file, content }); setBusy(false) }),
    start: (content, name, source, remotePlatform) => flushSync(() => {
      setFile({ ...file, path: '/fixture/' + revision + '/' + name, name, source, content })
      setPlatform(remotePlatform); setBusy(false); setRevision(revision + 1)
    }),
    theme: (value) => flushSync(() => { setTheme(value); document.documentElement.dataset.theme = value === 'default-dark' ? 'transterm-dark' : 'transterm-light' })
  }
  return <FileEditorModal key={revision} file={file} isBusy={busy} isDirty={dirty} isSaving={false}
    errorMessage={null} onClose={() => {}} remotePlatform={platform} standalone themeMode={theme}
    onDraftChange={(content, encoding) => setDirty(content !== file.content || encoding !== file.encoding)}
    onReloadWithEncoding={() => {}}
    onSave={(content, encoding) => { window.saved = content; setFile({ ...file, content, encoding }); setDirty(false) }}/>
}
document.documentElement.dataset.platform = 'win32'
document.documentElement.dataset.theme = 'transterm-dark'
createRoot(document.getElementById('root')).render(<Fixture/>);
`
)

let browser
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false }, clearScreen: false })
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL })
  const page = await browser.newPage({
    viewport: { width: 1073, height: 546 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.transterm = {
      platform: 'win32',
      getUiStateItem: async (key) => localStorage.getItem(key),
      setUiStateItem: async (key, value) => localStorage.setItem(key, value)
    }
  })
  const url = `http://127.0.0.1:${server.httpServer.address().port}/${basename(directory)}/index.html`
  await page.goto(url)
  await page.waitForFunction(() => window.fixture?.editor())
  assert.equal(await page.evaluate(() => window.fixture.model().getEOL()), '\r\n')

  const original = '#!/bin/sh\necho hello\n'
  await page.evaluate((content) => window.fixture.load(content), original)
  await page.waitForFunction((content) => window.fixture.model().getValue() === content, original)
  await page.getByRole('button', { name: 'LF', exact: true }).click()
  await page.getByRole('button', { name: 'CRLF (Windows)', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  assert.equal(await page.evaluate(() => window.saved), original.replaceAll('\n', '\r\n'))
  await page.evaluate(() => window.fixture.editor().trigger('regression', 'undo', null))
  await page.waitForFunction((content) => window.fixture.model().getValue() === content, original)
  await page.getByRole('button', { name: 'LF', exact: true }).waitFor()

  await page.evaluate(() => {
    const model = window.fixture.model()
    const editor = window.fixture.editor()
    editor.setPosition({ lineNumber: model.getLineCount(), column: model.getLineMaxColumn(model.getLineCount()) })
    editor.trigger('regression', 'paste', { text: 'echo one\r\necho two\r\n' })
    editor.focus()
  })
  await page.waitForFunction(() => window.fixture.editor().hasTextFocus())
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.waitForFunction(
    (content) => window.fixture.model().getValue() === content,
    original + 'echo one\necho two\n\n'
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  assert.equal(await page.evaluate(() => window.saved), original + 'echo one\necho two\n\n')

  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.getByRole('button', { name: 'Show Whitespace', exact: true }).click()
  assert.equal(await page.evaluate(() => window.fixture.whitespace()), 'all')
  await page.screenshot({ path: '/tmp/transterm-editor-dark.png' })
  await page.reload()
  await page.waitForFunction(() => window.fixture?.editor() && window.fixture.whitespace() === 'all')

  for (const [content, name, source, platform, expected] of [
    ['', 'test.sh', 'local', 'unknown', '\n'],
    ['#!/usr/bin/env bash', 'script', 'local', 'unknown', '\n'],
    ['', 'config', 'remote', 'linux', '\n'],
    ['', 'config', 'remote', 'freebsd', '\n'],
    ['', 'config', 'remote', 'windows', '\r\n'],
    ['', 'config', 'remote', 'unknown', '\r\n'],
    ['', 'config.txt', 'local', 'linux', '\r\n'],
    ['a\nb\n', 'test.txt', 'local', 'unknown', '\n'],
    ['a\r\nb\r\n', 'test.sh', 'remote', 'linux', '\r\n']
  ]) {
    await page.evaluate((args) => window.fixture.start(...args), [content, name, source, platform])
    await page.waitForFunction(() => window.fixture?.editor())
    assert.equal(await page.evaluate(() => window.fixture.model().getEOL()), expected, `${source} ${platform} ${name}`)
    assert.equal(await page.evaluate(() => window.fixture.model().getValue()), content)
  }
  await page.evaluate(() => window.fixture.theme('default-light'))
  await page.setViewportSize({ width: 800, height: 500 })
  await page.screenshot({ path: '/tmp/transterm-editor-light-small.png' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: delayed LF load, CRLF conversion/save/undo, LF paste/Enter, whitespace persistence, defaults and small layout'
  )
} finally {
  await browser?.close()
  await server.close()
  rmSync(directory, { recursive: true, force: true })
}
