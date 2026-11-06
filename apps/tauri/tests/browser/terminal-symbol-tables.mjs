/* global window, document, requestAnimationFrame, NodeFilter */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTypeScript } from './helpers/load-typescript.mjs'
import {
  terminalSymbolCases,
  terminalSymbolTable,
  terminalSymbolGridRows,
  terminalSymbolGrid
} from '../fixtures/terminal-symbol-table.mjs'

const require = createRequire(import.meta.url)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp')
const root = new URL('../../../../', import.meta.url)
const source = new URL('../../src/renderer/', import.meta.url)
const artifacts = process.env.TERMINAL_TABLE_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), 'transterm-symbol-tables-'))
console.log('Table artifacts:', artifacts)
const engine = process.env.PLAYWRIGHT_ENGINE === 'webkit' ? webkit : chromium
const browser = await engine.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH
})
try {
  for (const scale of [1, 1.25, 2]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1600 }, deviceScaleFactor: scale })
    await page.setContent('<div class="terminal-host" id="host"></div>')
    await page.addStyleTag({ path: fileURLToPath(new URL('node_modules/@xterm/xterm/css/xterm.css', root)) })
    await page.addStyleTag({ path: fileURLToPath(new URL('xterm-adapters/xterm-compat.css', source)) })
    for (const [family, path] of [
      ['Test Mono', 'jetbrains-mono/JetBrainsMono-400.ttf'],
      ['Test CJK', 'noto-sans-sc/NotoSansSC-Variable.ttf']
    ]) {
      const data = readFileSync(new URL(`assets/fonts/text/${path}`, source)).toString('base64')
      await page.addStyleTag({ content: `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${data})}` })
    }
    await page.evaluate(async () => {
      await Promise.all(['Test Mono', 'Test CJK'].map((family) => document.fonts.load(`24px "${family}"`)))
    })
    for (const path of ['@xterm/xterm/lib/xterm.js', '@xterm/addon-unicode11/lib/addon-unicode11.js']) {
      await page.addScriptTag({ path: fileURLToPath(new URL(`node_modules/${path}`, root)) })
    }
    for (const [file, symbol] of [
      ['terminal-emoji-widths', 'registerTerminalEmojiWidths'],
      ['terminal-selection-renderer', 'registerTerminalSelectionRenderer'],
      ['terminal-symbol-glyph-renderer', 'registerTerminalSymbolGlyphRenderer'],
      ['terminal-block-glyph-renderer', 'registerTerminalBlockGlyphRenderer']
    ])
      await loadTypeScript(page, fileURLToPath(new URL(`xterm-adapters/${file}.ts`, source)), symbol)
    await page.evaluate(
      async ({ table, cases }) => {
        const terminal = new window.Terminal({
          cols: 32,
          rows: cases.length,
          fontFamily: '"Test Mono", "Test CJK", monospace',
          fontSize: 24,
          lineHeight: 1.3,
          allowProposedApi: true,
          cursorBlink: false,
          theme: {
            foreground: '#000000',
            background: '#ffffff',
            selectionForeground: '#000000',
            selectionBackground: '#bbdddd',
            selectionInactiveBackground: '#bbdddd'
          }
        })
        terminal.loadAddon(new window.Unicode11Addon.Unicode11Addon())
        terminal.unicode.activeVersion = '11'
        window.registerTerminalEmojiWidths(terminal)
        terminal.open(document.getElementById('host'))
        window.registerTerminalSelectionRenderer(terminal)
        window.registerTerminalSymbolGlyphRenderer(terminal)
        window.registerTerminalBlockGlyphRenderer(terminal)
        window.terminal = terminal
        window.partialSelectionRow = cases.findIndex(([glyph]) => glyph === '👨‍💻')
        window.paint = async () => {
          for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame)
        }
        window.layout = () => {
          const rows = terminal.element.querySelector('.xterm-rows')
          const cellWidth = rows.getBoundingClientRect().width / terminal.cols
          return cases.map(([glyph, width], index) => {
            const row = rows.children[index]
            const line = terminal.buffer.active.getLine(index)
            const walls = []
            const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
            while (walker.nextNode()) {
              const node = walker.currentNode
              for (let offset = 0; offset < node.length; offset++)
                if (node.data[offset] === '|' || node.data[offset] === '│') {
                  const range = document.createRange()
                  range.setStart(node, offset)
                  range.setEnd(node, offset + 1)
                  walls.push((range.getBoundingClientRect().left - row.getBoundingClientRect().left) / cellWidth)
                }
            }
            return {
              glyph,
              width: line.getCell(2).getWidth(),
              chars: line.getCell(2).getChars(),
              walls,
              bufferWalls: [0, 10, 24].map((column) => line.getCell(column).getChars()),
              expectedWidth: width,
              cellWidth
            }
          })
        }
        await new Promise((resolve) => terminal.write('\x1b[?25l' + table, resolve))
        await window.paint()
      },
      { table: terminalSymbolTable, cases: terminalSymbolCases }
    )
    for (const fontFamily of ['"Test Mono", "Test CJK", monospace', '"Test CJK", monospace']) {
      for (const fontSize of [24, 14, 20]) {
        await page.evaluate(
          async ({ size, family }) => {
            window.terminal.options.fontFamily = family
            window.terminal.options.fontSize = size
            await window.paint()
          },
          { size: fontSize, family: fontFamily }
        )
        const screen = page.locator('.xterm-screen')
        const before = await sharp(await screen.screenshot())
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        for (const selected of [false, 'all', 'partial']) {
          await page.evaluate(async (select) => {
            if (select === 'all') window.terminal.selectAll()
            else if (select === 'partial') window.terminal.select(3, window.partialSelectionRow, window.terminal.cols)
            else window.terminal.clearSelection()
            await window.paint()
          }, selected)
          const layout = await page.evaluate(() => window.layout())
          if (selected === 'all') {
            const copied = await page.evaluate(() => window.terminal.getSelection())
            assert.equal(copied.replaceAll('\r', '').trimEnd(), terminalSymbolTable.replaceAll('\r', ''))
          }
          await screen.screenshot({
            path: join(
              artifacts,
              `${scale}-${fontSize}-${fontFamily.includes('Test Mono') ? 'mono' : 'cjk'}-${selected || 'normal'}.png`
            )
          })
          for (const [index, row] of layout.entries()) {
            assert.equal(row.width, row.expectedWidth, `${row.glyph} must keep the producer's column width`)
            assert.equal(row.chars, row.glyph, 'combined text must remain one buffer cell')
            assert.equal(row.walls.length, 3, `${row.glyph} must retain all table walls`)
            assert.deepEqual(
              row.bufferWalls,
              Array(3).fill(index % 2 ? '│' : '|'),
              'buffer table walls stay on their exact columns'
            )
            // Compare to an ASCII control: native WidthCache rounding must not mask symbol-induced drift.
            const reference = layout[index % 2]
            row.walls.forEach((column, i) =>
              assert.ok(
                Math.abs(column - reference.walls[i]) * row.cellWidth <= 1,
                `${row.glyph}: wall columns ${row.walls}, ASCII ${reference.walls}`
              )
            )
          }
          if (selected) {
            const after = await sharp(await screen.screenshot())
              .removeAlpha()
              .raw()
              .toBuffer()
            const cellWidth = before.info.width / 32
            const cellHeight = before.info.height / terminalSymbolCases.length
            for (let row = 0; row < terminalSymbolCases.length; row++) {
              let ink = 0,
                lost = 0
              for (let y = Math.ceil(row * cellHeight); y < Math.floor((row + 1) * cellHeight); y++) {
                for (
                  let x = Math.ceil(2 * cellWidth);
                  x < Math.floor((2 + terminalSymbolCases[row][1]) * cellWidth);
                  x++
                ) {
                  const i = (y * before.info.width + x) * 3
                  if (Math.min(...before.data.subarray(i, i + 3)) < 220) {
                    ink++
                    if (
                      Math.max(...[0, 1, 2].map((channel) => Math.abs(after[i + channel] - before.data[i + channel]))) >
                      100
                    )
                      lost++
                  }
                }
              }
              assert.ok(ink > 0, `${terminalSymbolCases[row][0]} must paint ink`)
              assert.ok(
                lost <= Math.max(1, ink * 0.02),
                `${terminalSymbolCases[row][0]} changes when selected: lost ${lost}/${ink}`
              )
            }
          }
        }
        await page.evaluate(async () => {
          window.terminal.clearSelection()
          await window.paint()
        })
        console.log(JSON.stringify({ scale, fontSize, fontFamily, tableColumns: true, selectionShape: true }))
      }
    }
    await page.evaluate(
      async ({ grid, gridRows }) => {
        window.terminal.reset()
        window.terminal.resize(81, gridRows.length)
        await new Promise((resolve) => window.terminal.write('\x1b[?25l' + grid, resolve))
        window.gridRows = gridRows
        await window.paint()
      },
      { grid: terminalSymbolGrid, gridRows: terminalSymbolGridRows }
    )
    for (const size of [24, 14, 20]) {
      for (const selection of ['none', 'all', 'partial']) {
        const report = await page.evaluate(
          async ({ size, selection }) => {
            const terminal = window.terminal
            terminal.options.fontSize = size
            if (selection === 'all') terminal.selectAll()
            else if (selection === 'partial') terminal.select(2, 1, 81 * 4)
            else terminal.clearSelection()
            await window.paint()
            const rows = [...terminal.element.querySelector('.xterm-rows').children]
            const walls = rows.map((row) => {
              const result = []
              const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
              for (let node; (node = walker.nextNode());) {
                for (let offset = 0; offset < node.length; offset++) {
                  if (node.data[offset] !== '│') continue
                  const range = document.createRange()
                  range.setStart(node, offset)
                  range.setEnd(node, offset + 1)
                  result.push(range.getBoundingClientRect().left - row.getBoundingClientRect().left)
                }
              }
              return result
            })
            const cells = window.gridRows.map((cells, row) =>
              Array.from({ length: cells.length }, (_, column) => {
                const line = terminal.buffer.active.getLine(row)
                const cell = line.getCell(column * 10 + 2)
                return {
                  chars: cell.getChars(),
                  width: cell.getWidth(),
                  wall: line.getCell(column * 10 + 10).getChars()
                }
              })
            )
            return { walls, cells, copied: terminal.getSelection() }
          },
          { size, selection }
        )
        for (const [row, cells] of terminalSymbolGridRows.entries()) {
          assert.equal(report.walls[row].length, 9, 'mixed grid keeps all nine walls')
          report.walls[row].forEach((x, column) =>
            assert.ok(Math.abs(x - report.walls[0][column]) <= 1, `mixed grid drift at ${row}:${column}`)
          )
          cells.forEach(([glyph, width], column) =>
            assert.deepEqual(report.cells[row][column], { chars: glyph, width, wall: '│' })
          )
        }
        if (selection === 'all')
          assert.equal(report.copied.replaceAll('\r', '').trimEnd(), terminalSymbolGrid.replaceAll('\r', ''))
      }
    }
    console.log(JSON.stringify({ scale, mixedGrid: true }))
    await page.close()
  }
} finally {
  await browser.close()
}
