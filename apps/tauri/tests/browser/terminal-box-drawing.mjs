/* global window, document, requestAnimationFrame */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadTypeScript } from './helpers/load-typescript.mjs'

const require = createRequire(import.meta.url)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp')
const root = new URL('../../../../', import.meta.url)
const source = new URL('../../src/renderer/', import.meta.url)
const browser = await (process.env.PLAYWRIGHT_ENGINE === 'webkit' ? webkit : chromium).launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH
})
try {
  for (const scale of [1, 1.25, 1.5, 2]) {
    const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 1000, height: 1400 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setContent('<div id="host" style="position:relative;left:0.3px;top:0.2px"></div>')
    await page.addStyleTag({ path: fileURLToPath(new URL('node_modules/@xterm/xterm/css/xterm.css', root)) })
    for (const [family, file] of [
      ['JetBrains', 'jetbrains-mono/JetBrainsMono-400.ttf'],
      ['Cascadia', 'cascadia-code/CascadiaCode.ttf'],
      ['Noto', 'noto-sans-sc/NotoSansSC-Variable.ttf']
    ]) {
      const data = readFileSync(new URL(`assets/fonts/text/${file}`, source)).toString('base64')
      await page.addStyleTag({ content: `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${data})}` })
      assert.equal(
        await page.evaluate(async (family) => (await document.fonts.load(`24px "${family}"`)).length, family),
        1
      )
    }
    for (const path of ['@xterm/xterm/lib/xterm.js', '@xterm/addon-unicode11/lib/addon-unicode11.js']) {
      await page.addScriptTag({ path: fileURLToPath(new URL(`node_modules/${path}`, root)) })
    }
    for (const [file, symbol] of [
      ['terminal-symbol-glyph-renderer', 'registerTerminalSymbolGlyphRenderer'],
      ['terminal-selection-renderer', 'registerTerminalSelectionRenderer'],
      ['terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer']
    ])
      await loadTypeScript(page, fileURLToPath(new URL(`xterm-adapters/${file}.ts`, source)), symbol)

    for (const family of ['JetBrains', 'Cascadia']) {
      for (const fontSize of [12, 13, 14, 24]) {
        await page.evaluate(
          async ({ family, fontSize }) => {
            const terminal = new window.Terminal({
              cols: 36,
              rows: 30,
              fontFamily: `"${family}", "Noto", monospace`,
              fontSize,
              lineHeight: 1.05,
              letterSpacing: 0,
              allowProposedApi: true,
              theme: { foreground: '#000000', background: '#ffffff', selectionBackground: '#88bbbb' }
            })
            terminal.loadAddon(new window.Unicode11Addon.Unicode11Addon())
            terminal.unicode.activeVersion = '11'
            terminal.open(document.getElementById('host'))
            window.terminal = terminal
            window.registerTerminalSelectionRenderer(terminal)
            window.registerTerminalSymbolGlyphRenderer(terminal)
            window.blocks = window.registerTerminalBlockGlyphRenderer(terminal)
            window.paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const light = [
              '┌────┬────┬────┐',
              '│ A  │ 中 │ e\u0301  │',
              '├────┼────┼────┤',
              '│ B  │ C  │ D  │',
              '└────┴────┴────┘'
            ]
            const double = [
              '╔════╦════╦════╗',
              '║ A  ║ 中 ║ e\u0301  ║',
              '╠════╬════╬════╣',
              '║ B  ║ C  ║ D  ║',
              '╚════╩════╩════╝'
            ]
            const heavy = [
              '┏━━━━┳━━━━┳━━━━┓',
              '┃ A  ┃ 中 ┃ e\u0301  ┃',
              '┣━━━━╋━━━━╋━━━━┫',
              '┃ B  ┃ C  ┃ D  ┃',
              '┗━━━━┻━━━━┻━━━━┛'
            ]
            const round = ['╭────┬────┬────╮', ...light.slice(1, 4), '╰────┴────┴────╯']
            const catalogue = Array.from({ length: 4 }, (_, row) =>
              Array.from({ length: 32 }, (_, column) => String.fromCodePoint(0x2500 + row * 32 + column)).join('')
            )
            window.sample = [
              ...light,
              '',
              ...double,
              '',
              ...heavy,
              '',
              ...round,
              '',
              ...catalogue,
              '▘▝▖▗█ ▢ □ ☐ ✻ 中文'
            ].join('\r\n')
            await new Promise((resolve) => terminal.write('\x1b[?25l' + window.sample, resolve))
            await window.paint()
          },
          { family, fontSize }
        )

        const screen = page.locator('.xterm-screen')
        const png = await screen.screenshot()
        const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
        const geometry = await page.evaluate(() => {
          const terminal = window.terminal
          const canvases = [...terminal.element.querySelectorAll('.xterm-block-glyph-row')]
          return {
            width: terminal.element.querySelector('.xterm-screen').getBoundingClientRect().width,
            rows: canvases.map((canvas) => ({
              row: Number(canvas.dataset.rowIndex),
              top: parseFloat(canvas.style.top),
              height: canvas.height
            })),
            text: Array.from({ length: 30 }, (_, row) => terminal.buffer.active.getLine(row).translateToString(true))
          }
        })
        const cellWidth = (geometry.width * scale) / 36
        const dark = (x, y) => {
          if (x < 0 || y < 0 || x >= info.width || y >= info.height) return false
          const offset = (y * info.width + x) * 3
          return data[offset] < 180 && data[offset + 1] < 180 && data[offset + 2] < 180
        }
        const horizontal = (row) => {
          const r = geometry.rows.find((r) => r.row === row)
          return Math.round(r.top * scale + r.height / 2)
        }
        for (const start of [0, 6, 12, 18]) {
          // Every device row between corner centers must contain a vertical
          // stroke; every column between them must contain a horizontal one.
          // Search only across thickness/rounding, never along the stroke.
          const rounded = start === 18
          for (const column of [0, 5, 10, 15]) {
            const cx = Math.round((column + 0.5) * cellWidth)
            for (
              let y = horizontal(start) + (rounded ? Math.ceil(cellWidth) : 2);
              y < horizontal(start + 4) - (rounded ? Math.ceil(cellWidth) : 2);
              y++
            ) {
              if (
                start === 6 &&
                [5, 10].includes(column) &&
                Math.abs(y - horizontal(start + 2)) <= Math.ceil(scale * 2)
              )
                continue
              assert.ok(
                Array.from({ length: 2 * Math.ceil(cellWidth / 2) + 1 }, (_, i) =>
                  dark(cx - Math.ceil(cellWidth / 2) + i, y)
                ).some(Boolean),
                `${family}/${scale}/${fontSize} vertical gap at ${column},${y}`
              )
            }
          }
          for (const row of [start, start + 2, start + 4]) {
            const cy = horizontal(row)
            for (
              let x = Math.ceil(cellWidth * (rounded && row !== start + 2 ? 1.5 : 0.5));
              x < Math.floor(cellWidth * (rounded && row !== start + 2 ? 14.5 : 15.5));
              x++
            ) {
              if (
                start === 6 &&
                row === start + 2 &&
                [0, 5, 10, 15].some((column) => Math.abs(x - (column + 0.5) * cellWidth) <= Math.ceil(scale * 2))
              )
                continue
              assert.ok(
                Array.from({ length: 2 * Math.ceil(scale * 3) + 1 }, (_, i) =>
                  dark(x, cy - Math.ceil(scale * 3) + i)
                ).some(Boolean),
                `${family}/${scale}/${fontSize} horizontal gap at ${x},${row}`
              )
            }
          }
        }
        if (process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true })
          await sharp(png).toFile(`${process.env.SCREENSHOT_DIR}/boxes-${family}-${scale}-${fontSize}.png`)
        }
        const lifecycle = await page.evaluate(async () => {
          const terminal = window.terminal
          const snapshot = () =>
            [...terminal.element.querySelectorAll('.xterm-block-glyph-row')].map((canvas) =>
              [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].filter(
                (_, i) => i % 4 === 3
              )
            )
          const original = snapshot()
          terminal.options.theme = { ...terminal.options.theme, selectionForeground: '#ff0000' }
          terminal.select(3, 2, 5)
          await window.paint()
          const canvas = terminal.element.querySelector('.xterm-block-glyph-row[data-row-index="2"]')
          const bytes = [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]
          const red = bytes.some(
            (_, i) =>
              i % 4 === 0 && bytes[i] === 255 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 255
          )
          terminal.clearSelection()
          await window.paint()
          const restored = JSON.stringify(original) === JSON.stringify(snapshot())
          await new Promise((resolve) => terminal.write('\x1b[H\x1b[7m' + window.sample + '\x1b[0m', resolve))
          await window.paint()
          const inverseText = terminal.buffer.active.getLine(0).translateToString(true)
          await new Promise((resolve) => terminal.write('\x1b[?1049h\x1b[H┌─┐\r\n│ │\r\n└─┘', resolve))
          await window.paint()
          const alternate = terminal.buffer.active.type
          await new Promise((resolve) => terminal.write('\x1b[?1049l', resolve))
          await window.paint()
          const normalText = terminal.buffer.active.getLine(0).translateToString(true)
          terminal.resize(40, 32)
          terminal.options.fontSize += 1
          terminal.refresh(0, terminal.rows - 1)
          await window.paint()
          const rowsAfterResize = terminal.element.querySelectorAll('.xterm-block-glyph-row').length
          let renders = 0
          const subscription = terminal.onRender(() => renders++)
          await window.paint()
          await window.paint()
          subscription.dispose()
          window.blocks.dispose()
          return {
            red,
            restored,
            inverseText,
            alternate,
            normalText,
            rowsAfterResize,
            settledRenders: renders,
            remaining: terminal.element.querySelectorAll('.xterm-block-glyph, .xterm-block-glyph-placeholder').length
          }
        })
        assert.equal(lifecycle.red, true)
        assert.equal(lifecycle.restored, true, 'clearing selection restores exact glyph coverage')
        assert.equal(lifecycle.inverseText, '┌────┬────┬────┐')
        assert.equal(lifecycle.normalText, lifecycle.inverseText)
        assert.equal(lifecycle.alternate, 'alternate')
        assert.ok(lifecycle.rowsAfterResize > 0 && lifecycle.rowsAfterResize <= 32)
        assert.equal(lifecycle.settledRenders, 0)
        assert.equal(lifecycle.remaining, 0)
        assert.ok(geometry.text.includes('│ A  │ 中 │ e\u0301  │'), 'CJK and combining cells remain intact')
        assert.deepEqual(errors, [])
        console.log(JSON.stringify({ family, scale, fontSize, connectedTables: 4, catalogue: 128, lifecycle }))
        await page.evaluate(() => {
          window.terminal.dispose()
          document.getElementById('host').replaceChildren()
        })
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
}
