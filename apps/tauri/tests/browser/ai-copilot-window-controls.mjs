// Run with Playwright installed, or set PLAYWRIGHT_MODULE_PATH.
/* global document, getComputedStyle */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const renderer = new URL('../../src/renderer/', import.meta.url)

// Preserve the production stylesheet order, including theme and layout overrides.
function inlineStylesheet(url) {
  return readFileSync(url, 'utf8').replace(/@import\s+['"]([^'"]+)['"]\s*;/g, (_, path) =>
    inlineStylesheet(new URL(path, url))
  )
}

const css = ['styles/index.css', 'features/layout/window-menubar.css', 'features/layout/app-main-workspace.css']
  .map((path) => inlineStylesheet(new URL(path, renderer)))
  .join('\n')

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
  await page.setContent(`
    <div class="fs-shell has-window-menubar" style="--sidebar-width:214px;--brand-width:214px">
      <div class="window-menubar" data-tauri-drag-region="deep">
        <div class="window-menu-items"><button>文件</button><button>视图</button><button>窗口</button></div>
        <div class="window-control-buttons">
          <button aria-label="Minimize">−</button><button aria-label="Maximize">□</button>
          <button aria-label="Close" class="app-close-button app-close-button--window">×</button>
        </div>
      </div>
      <div class="fs-tabbar"></div>
      <main class="fs-main no-status"><div class="workspace-stage"></div></main>
      <div class="terminal-right-frame"></div>
      <div class="transfer-strip"></div>
    </div>
  `)
  await page.addStyleTag({ content: css })
  let scenarios = 0
  for (const platform of ['win32', 'linux']) {
    for (const theme of ['transterm-light', 'transterm-dark', 'codex-light', 'codex-dark']) {
      for (const view of ['remote', 'local', 'home']) {
        for (const width of [960, 1280, 1920]) {
          await page.setViewportSize({ width, height: 820 })
          await page.evaluate(
            ({ platform, theme, view }) => {
              document.documentElement.dataset.platform = platform
              document.documentElement.dataset.theme = theme
              const shell = document.querySelector('.fs-shell')
              shell.classList.toggle('is-local-terminal', view === 'local')
              shell.classList.toggle('is-home-active', view === 'home')
              document.querySelector('.fs-main').classList.toggle('full-width', view !== 'remote')
            },
            { platform, theme, view }
          )
          // Exercise opening, resizing and closing without recreating the shell.
          // Home hides Copilot even when its open preference is retained.
          for (const panelWidth of view === 'home' ? [0] : [0, 320, 540, 368, 0]) {
            await page.evaluate((panelWidth) => {
              const shell = document.querySelector('.fs-shell')
              shell.classList.toggle('has-ai-copilot', panelWidth > 0)
              shell.style.setProperty('--ai-copilot-panel-width', `${panelWidth}px`)
              document.querySelector('.ai-copilot-panel')?.remove()
              if (panelWidth) {
                const panel = document.createElement('aside')
                panel.className = 'ai-copilot-panel'
                panel.innerHTML = '<header class="ai-copilot-header">AI Copilot</header>'
                document.querySelector('.workspace-stage').append(panel)
                // Measure the settled layout after the production entry animation.
                for (const animation of panel.getAnimations()) animation.finish()
              }
            }, panelWidth)
            const geometry = await page.evaluate(() => {
              const shell = document.querySelector('.fs-shell').getBoundingClientRect()
              const menubar = document.querySelector('.window-menubar').getBoundingClientRect()
              const controls = document.querySelector('.window-control-buttons').getBoundingClientRect()
              const panel = document.querySelector('.ai-copilot-panel')?.getBoundingClientRect()
              return {
                rightGap: shell.right - controls.right,
                menubarRightGap: shell.right - menubar.right,
                panelTopGap: panel ? panel.top - menubar.bottom : null,
                panelRightGap: panel ? shell.right - panel.right : null,
                controlsHeight: controls.height,
                closeVisible: document
                  .elementFromPoint(controls.right - 15, controls.top + controls.height / 2)
                  ?.closest('button')
                  ?.getAttribute('aria-label'),
                menubarPadding: getComputedStyle(document.querySelector('.window-menubar')).paddingRight
              }
            })
            const context = `${platform}/${theme}/${view}/${width}px/panel=${panelWidth}px`
            assert.ok(
              Math.abs(geometry.rightGap) <= 1,
              `${context}: controls are ${geometry.rightGap}px from the right`
            )
            assert.ok(Math.abs(geometry.menubarRightGap) <= 1, `${context}: menubar must span the window`)
            assert.equal(geometry.menubarPadding, '0px', `${context}: AI panel must not inset the window controls`)
            assert.equal(geometry.closeVisible, 'Close', `${context}: close button must remain reachable`)
            assert.ok(geometry.controlsHeight <= 28, `${context}: controls must fit the compact title row`)
            if (panelWidth) {
              assert.ok(Math.abs(geometry.panelTopGap) <= 1, `${context}: AI panel must start below the menubar`)
              assert.ok(Math.abs(geometry.panelRightGap) <= 1, `${context}: AI panel must reach the right edge`)
            }
            scenarios++
          }
        }
      }
    }
  }
  console.log(
    `PASS: ${scenarios} window-control layouts, AI open/resize/close, four themes, Windows/Linux CSS, high DPI`
  )
} finally {
  await browser.close()
}
