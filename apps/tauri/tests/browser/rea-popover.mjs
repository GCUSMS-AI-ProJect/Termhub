/* global window, document */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { build } = require(process.env.ESBUILD_MODULE_PATH || 'esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const directory = mkdtempSync(join(tmpdir(), 'termhub-rea-popover-'))
let browser
try {
  await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('../../../../', import.meta.url)),
      loader: 'tsx',
      contents: `
import { createRoot } from 'react-dom/client'
import { AiReaControl } from './apps/tauri/src/renderer/features/ai/ai-rea-control'
import { applyThemeVariables } from './apps/tauri/src/renderer/app/theme-config'
import { createDefaultThemeConfig, createCodexThemeConfig } from '@transterm/core'
import './apps/tauri/src/renderer/styles/index.css'
window.transterm = { getReaActivation: async () => ({ enabled: true, status: {
  ready: true, toolCount: 207, engines: Array.from({length:8}, (_,i) => ({id:String(i),name:'Engine '+i,status:'available',detail:'Ready'}))
}}) }
window.setTheme = (base,variant) => applyThemeVariables(base+'-'+variant, (base === 'codex' ? createCodexThemeConfig : createDefaultThemeConfig)(variant))
window.analyzed = []
createRoot(document.getElementById('fixture')).render(<AiReaControl activeTab={{id:'ssh',sessionType:'ssh',title:'Test SSH'}} rootTab={{id:'ssh',sessionType:'ssh'}} activeSession={{connected:true,aiSessionRevision:'1'}} mode="semi-automatic" isStreaming={false} onAnalyze={path => window.analyzed.push(path)} />)
`
    },
    jsx: 'automatic',
    bundle: true,
    outfile: join(directory, 'bundle.js'),
    loader: { '.svg': 'dataurl', '.ttf': 'dataurl', '.woff2': 'dataurl', '.png': 'dataurl' },
    logLevel: 'silent'
  })
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.error(error.message)
  })
  await page.route('http://localhost:4179/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html data-platform="win32"><body><div style="position:fixed;right:0;bottom:30px;width:320px;height:160px;overflow:hidden;contain:paint;transform:translateZ(0)"><div id="fixture" style="margin:20px"></div></div></body></html>`
    })
  )
  await page.goto('http://localhost:4179/')
  await page.addStyleTag({ content: readFileSync(join(directory, 'bundle.css'), 'utf8') })
  await page.addScriptTag({ content: readFileSync(join(directory, 'bundle.js'), 'utf8') })
  const popup = page.locator('.ai-rea-popover')
  const verify = async () => {
    await page.waitForTimeout(180)
    const visible = await popup.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const heading = element.querySelector('.ai-rea-heading').getBoundingClientRect()
      const hit = document.elementFromPoint(heading.left + heading.width / 2, heading.top + heading.height / 2)
      return (
        element.parentElement === document.body &&
        box.left >= 11 &&
        box.top >= 11 &&
        box.right <= window.innerWidth - 11 &&
        box.bottom <= window.innerHeight - 11 &&
        element.contains(hit)
      )
    })
    assert.equal(visible, true, 'dialog must escape clipped ancestors and stay inside the viewport')
  }
  let checks = 0
  for (const base of ['transterm', 'codex'])
    for (const variant of ['dark', 'light']) {
      await page.evaluate(([base, variant]) => window.setTheme(base, variant), [base, variant])
      for (const viewport of [
        { width: 1280, height: 820 },
        { width: 1150, height: 360 }
      ]) {
        await page.setViewportSize(viewport)
        await page.locator('.ai-rea-details-toggle').click()
        await verify()
        if (process.env.REA_SCREENSHOT_PATH) await page.screenshot({ path: process.env.REA_SCREENSHOT_PATH })
        const input = popup.locator('input')
        await input.fill('/tmp/sample.bin')
        assert.equal(await popup.count(), 1, 'clicking inside a portal must not dismiss it')
        await popup.locator('summary').click()
        await verify()
        await page.setViewportSize({ width: viewport.width - 150, height: viewport.height })
        await verify()
        await page.keyboard.press('Escape')
        assert.equal(await popup.count(), 0)
        assert.equal(await page.locator('.ai-rea-details-toggle').evaluate((el) => el === document.activeElement), true)
        checks += 1
      }
    }
  await page.locator('.ai-rea-details-toggle').click()
  await popup.locator('input').fill('/tmp/sample.bin')
  await popup.locator('.ai-rea-target button').click()
  assert.deepEqual(await page.evaluate(() => window.analyzed), ['/tmp/sample.bin'])
  await page.locator('.ai-rea-details-toggle').click()
  await page.mouse.click(20, 20)
  assert.equal(await popup.count(), 0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: ' +
      checks +
      ' REA theme/viewport cases, clipping, resize, expansion, editing, analysis, Escape focus and outside click'
  )
} finally {
  await browser?.close()
  rmSync(directory, { recursive: true, force: true })
}
