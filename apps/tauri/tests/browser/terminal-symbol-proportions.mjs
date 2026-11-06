/* global window, document, requestAnimationFrame */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadTypeScript } from './helpers/load-typescript.mjs'

const require = createRequire(import.meta.url)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp')
const root = new URL('../../../../', import.meta.url)
const source = new URL('../../src/renderer/', import.meta.url)
const engine = process.env.PLAYWRIGHT_ENGINE === 'webkit' ? webkit : chromium
const browser = await engine.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH
})
const glyphs = [
  '⚠️',
  '⚠',
  '⚠︎',
  '•',
  '✅',
  '❌',
  '▢',
  '※',
  '⚠️•',
  '✔️',
  '✖️',
  '1️⃣',
  '1⃣',
  '🇨🇳',
  '🇨🇳🇺🇸',
  '👍🏽',
  '👩🏽‍🚀',
  '👨‍👩‍👧‍👦'
]
const cellWidths = [2, 1, 1, 1, 2, 2, 1, 1, 3, 2, 2, 2, 2, 2, 4, 2, 2, 2]
const inkBounds = (image, row) => {
  const cell = image.info.width / 32
  const height = image.info.height / glyphs.length
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (let y = Math.ceil(row * height); y < Math.floor((row + 1) * height); y++) {
    for (let x = Math.ceil(3 * cell); x < Math.floor(8 * cell); x++) {
      const i = (y * image.info.width + x) * 3
      if (Math.min(...image.data.subarray(i, i + 3)) >= 180) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  assert.ok(Number.isFinite(left), `${glyphs[row]} must paint visible ink`)
  return { width: right - left + 1, height: bottom - top + 1 }
}
try {
  for (const scale of [1, 1.25, 2]) {
    const page = await browser.newPage({ deviceScaleFactor: scale })
    await page.setContent('<div class="terminal-host" id="host"></div>')
    await page.addStyleTag({ path: fileURLToPath(new URL('node_modules/@xterm/xterm/css/xterm.css', root)) })
    for (const [family, path, weight] of [
      ['Test Mono', 'jetbrains-mono/JetBrainsMono-400.ttf', '400'],
      ['Test Mono', 'jetbrains-mono/JetBrainsMono-700.ttf', '700'],
      ['Test CJK', 'noto-sans-sc/NotoSansSC-Variable.ttf', '100 900']
    ]) {
      const data = readFileSync(new URL(`assets/fonts/text/${path}`, source)).toString('base64')
      await page.addStyleTag({
        content: `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/ttf;base64,${data})}`
      })
    }
    await page.evaluate(async () => {
      for (const family of ['Test Mono', 'Test CJK']) {
        for (const weight of [400, 700]) {
          assertFont(await document.fonts.load(`${weight} 24px "${family}"`))
        }
      }
      function assertFont(faces) {
        if (!faces.length) throw new Error('Test font not loaded')
      }
    })
    for (const path of ['@xterm/xterm/lib/xterm.js', '@xterm/addon-unicode11/lib/addon-unicode11.js']) {
      await page.addScriptTag({ path: fileURLToPath(new URL(`node_modules/${path}`, root)) })
    }
    await loadTypeScript(
      page,
      fileURLToPath(new URL('xterm-adapters/terminal-symbol-glyph-renderer.ts', source)),
      'registerTerminalSymbolGlyphRenderer'
    )
    await loadTypeScript(
      page,
      fileURLToPath(new URL('xterm-adapters/terminal-emoji-widths.ts', source)),
      'registerTerminalEmojiWidths'
    )
    for (const fontFamily of ['"Test Mono", "Test CJK", monospace', '"Test CJK", monospace']) {
      for (const fontSize of [14, 24]) {
        for (const bold of [false, true]) {
          await page.evaluate(
            async ({ glyphs, fontFamily, fontSize, bold }) => {
              document.getElementById('host').replaceChildren()
              const terminal = new window.Terminal({
                cols: 32,
                rows: glyphs.length,
                fontFamily,
                fontSize,
                lineHeight: 1.7,
                allowProposedApi: true,
                theme: { foreground: '#000000', background: '#ffffff' }
              })
              terminal.loadAddon(new window.Unicode11Addon.Unicode11Addon())
              terminal.unicode.activeVersion = '11'
              window.emojiWidths = window.registerTerminalEmojiWidths(terminal)
              terminal.open(document.getElementById('host'))
              window.terminal = terminal
              window.paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
              await new Promise((resolve) =>
                terminal.write(
                  '\x1b[?25l' +
                    glyphs
                      .map((glyph) => `    ${bold ? '\x1b[1m' : ''}${glyph}\x1b[22m     \x1b[1mJob\x1b[0m`)
                      .join('\r\n'),
                  resolve
                )
              )
              await window.paint()
            },
            { glyphs, fontFamily, fontSize, bold }
          )
          const screen = page.locator('.xterm-screen')
          const before = await sharp(await screen.screenshot())
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
          const layout = await page.evaluate(async () => {
            const terminal = window.terminal
            const rows = terminal.element.querySelector('.xterm-rows')
            const cellWidth = rows.getBoundingClientRect().width / terminal.cols
            const context = document.createElement('canvas').getContext('2d')
            const nativeFits = [...rows.children].slice(0, terminal.rows).map((row, index) => {
              const cell = terminal.buffer.active.getLine(index).getCell(4)
              const source = [...row.children].find((span) => span.textContent.includes(cell.getChars()))
              const style = window.getComputedStyle(source)
              context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
              const ink = context.measureText(cell.getChars())
              return ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight <= cellWidth * cell.getWidth()
            })
            window.registerTerminalSymbolGlyphRenderer(terminal)
            await window.paint()
            return [...rows.children].slice(0, terminal.rows).map((row, index) => {
              const label = [...row.children].find((span) => span.textContent.startsWith('J'))
              const line = terminal.buffer.active.getLine(index)
              let labelColumn = 4
              while (labelColumn < line.length && line.getCell(labelColumn).getChars() !== 'J') labelColumn++
              const transforms = [...row.querySelectorAll('span[style*="transform:"]')].map((glyph) => {
                const matrix = new window.DOMMatrix(window.getComputedStyle(glyph).transform)
                return { text: glyph.textContent, x: matrix.a, y: matrix.d }
              })
              terminal.select(4, index, labelColumn - 9)
              const copied = terminal.getSelection()
              terminal.clearSelection()
              return {
                copied,
                transforms,
                nativeFits: nativeFits[index],
                labelColumn,
                labelError: Math.abs(
                  label.getBoundingClientRect().left - row.getBoundingClientRect().left - labelColumn * cellWidth
                )
              }
            })
          })
          const after = await sharp(await screen.screenshot())
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
          layout.forEach((row, index) => {
            assert.equal(row.labelColumn, cellWidths[index] + 9, `${glyphs[index]} must occupy its Unicode cell width`)
            assert.equal(row.copied, glyphs[index], 'glyph fitting must retain exact variation selectors and copy text')
            assert.ok(row.labelError < 0.5, 'following text must stay on its buffer columns')
            for (const transform of row.transforms) {
              assert.equal(
                transform.x,
                transform.y,
                `${transform.text} must scale uniformly, never squash horizontally`
              )
              assert.ok(transform.x <= 1, 'fitting must never enlarge glyphs')
            }
            // Each cell is fitted independently; a multi-cell string has no single scale factor.
            if ([...new Intl.Segmenter().segment(glyphs[index])].length !== 1) return
            const natural = inkBounds(before, index)
            const fitted = inkBounds(after, index)
            // Allow two device pixels for rasterization of a rescaled outline.
            assert.ok(
              Math.abs(fitted.width - (natural.width * fitted.height) / natural.height) <= 2,
              `${glyphs[index]} must retain its natural aspect ratio: ${JSON.stringify({ natural, fitted })}`
            )
            if (row.nativeFits) {
              assert.ok(
                row.transforms.every((t) => t.x === 1),
                'ink that fits must not shrink for font advance/side bearings'
              )
              assert.ok(Math.abs(natural.width - fitted.width) <= 1, 'fitting symbols keep their visible width')
              assert.ok(Math.abs(natural.height - fitted.height) <= 1, 'fitting symbols keep their visible height')
            }
          })
          console.log(
            JSON.stringify({ scale, fontFamily, fontSize, bold, naturalProportions: true, columnsAndCopy: true })
          )
          await page.evaluate(() => {
            window.emojiWidths.dispose()
            window.terminal.dispose()
          })
        }
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
}
