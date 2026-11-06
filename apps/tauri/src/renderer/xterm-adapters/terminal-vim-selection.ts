import type { Terminal } from '@xterm/xterm'

export type VimVisualSelection = {
  text: string
  mode: 'character' | 'line' | 'block'
  startRow: number
  endRow: number
}

export type HighlightedBufferRow = {
  row: number
  firstColumn: number
  lastColumn: number
}

// Vim translates the mode label through gettext. These are the current UTF-8
// labels from Vim's official `src/po/*.po` catalogs, plus the legacy Central
// European forms shipped by Vim. Do not treat an arbitrary `-- <mode> --`
// message as Visual: `-- INSERT --` uses the same framing.
export const VIM_VISUAL_MODE_LABELS: Readonly<Record<VimVisualSelection['mode'], readonly string[]>> = {
  character: [
    'VISUAL',
    'VISUELE',
    'VIZUÁLNÍ',
    'VISUEL',
    'VISUELL',
    'VIDUMA',
    'VALINTA',
    'RADHARCACH',
    'VIZUÁLIS',
    'ԶՆՆԱԿԱՆ ՌԵԺԻՄ',
    'VISUALE',
    'ビジュアル',
    '비주얼',
    'VISUEEL',
    'WIZUALNY',
    'РЕЖИМ ВИЗУАЛЬНЫЙ ПОСИМВОЛЬНЫЙ',
    'VIZUÁLNE',
    'ВИЗУЕЛНО',
    'காட்சி',
    'GÖRSEL',
    'ВИБІР',
    'CHẾ ĐỘ VISUAL',
    '可视',
    '選取'
  ],
  line: [
    'VISUAL LINE',
    'VISUELE REËL',
    'VIZUÁLNÍ ŘÁDEK',
    'VISUAL LÍNIA',
    'VISUEL LINJE',
    'VISUELL ZEILE',
    'VIDUMA LINIO',
    'LÍNEA VISUAL',
    'VALINTARIVI',
    'VISUEL LIGNE',
    'LÍNE RADHARCACH',
    'VIZUÁLIS SOR',
    'ԶՆՆԱԿԱՆ ՏՈՂ',
    'VISUALE RIGA',
    'ビジュアル 行',
    '비주얼 라인',
    'VISUELL LINJE',
    'VISUELE REGEL',
    'WIZUALNY LINIOWY',
    'VISUAL/LINHA',
    'РЕЖИМ ВИЗУАЛЬНЫЙ ПОСТРОЧНЫЙ',
    'VIZUÁLNE RIADKY',
    'ВИЗУЕЛНА ЛИНИЈА',
    'VISUELL RAD',
    'காட்சி வரி',
    'GÖRSEL SATIR',
    'ВИБІР РЯДКІВ',
    'DÒNG VISUAL',
    '可视 行',
    '[行]'
  ],
  block: [
    'VISUAL BLOCK',
    'VISUELE BLOK',
    'VIZUÁLNÍ BLOK',
    'VISUAL BLOC',
    'VISUEL BLOK',
    'VISUELL BLOCK',
    'VIDUMA BLOKO',
    'BLOQUE VISUAL',
    'VALINTALOHKO',
    'VISUEL BLOC',
    'BLOC RADHARCACH',
    'VIZUÁLIS BLOKK',
    'ԶՆՆԱԿԱՆ ԲԼՈԿ',
    'VISUALE BLOCCO',
    'ビジュアル 矩形',
    '비주얼 블록',
    'VISUELL BLOKK',
    'VISUEEL BLOK',
    'WIZUALNY BLOKOWY',
    'VISUAL/BLOCO',
    'РЕЖИМ ВИЗУАЛЬНЫЙ БЛОЧНЫЙ',
    'VIZUÁLNY BLOK',
    'ВИЗУЕЛНИ БЛОК',
    'VISUELLT BLOCK',
    'விசுவல் பிளாக்',
    'GÖRSEL BLOK',
    'ВИБІР БЛОКУ',
    'KHỐI VISUAL',
    '可视 块',
    '[區塊]'
  ]
}

export function logVimVisualDiagnostic(stage: string, details: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return
  }

  // Keep this as a string, rather than a console object, so a screenshot of
  // Web Inspector contains the actual values without having to expand rows.
  console.debug(`[TerminalView][vim-visual] ${stage} ${JSON.stringify(details)}`)
}

export function getVimVisualModeIndicator(lineText: string): VimVisualSelection['mode'] | null {
  // The terminal's own status overlay can be appended to Vim's final buffer
  // line (for example `-- VISUAL --\n 5-15 …`), so the mode marker is not
  // necessarily the entire translated row.
  const indicator = lineText.match(/--\s+(.+?)\s+--/)
  if (!indicator || indicator[1].length > 64) {
    return null
  }

  const label = indicator[1].trim().replace(/\s+/g, ' ')
  for (const mode of ['character', 'line', 'block'] as const) {
    if (VIM_VISUAL_MODE_LABELS[mode].includes(label)) {
      return mode
    }
  }
  return null
}

/**
 * Vim enables DEC mouse tracking while it is running. That deliberately makes
 * xterm stop maintaining a local selection, so `terminal.getSelection()` is
 * empty even though Vim is visibly in Visual mode. Vim renders that range with
 * either SGR inverse or a non-default background; recover the corresponding
 * buffer text as a copy-only fallback.
 *
 * This is intentionally gated by Vim's locale-independent `-- <mode> --`
 * status-line framing, the active mouse protocol, and highlighted cells around
 * the active cursor. Other TUIs with coloured panels must not become
 * accidentally copyable selections.
 */
export function getVimVisualSelection(terminal: Terminal, diagnostics = false): VimVisualSelection | null {
  const diagnose = (stage: string, details: Record<string, unknown>) => {
    if (diagnostics) {
      logVimVisualDiagnostic(stage, details)
    }
  }

  if (terminal.modes.mouseTrackingMode === 'none') {
    diagnose('mouse-tracking-disabled', {})
    return null
  }

  const buffer = terminal.buffer.active
  const viewportStart = buffer.viewportY
  const viewportEnd = Math.min(buffer.viewportY + terminal.rows, buffer.length)
  let mode: VimVisualSelection['mode'] | null = null
  const modeIndicators: Array<{ row: number; text: string; mode: VimVisualSelection['mode'] }> = []

  // Vim renders its mode indicator on the final status line. Search upward so
  // a matching string in the file contents cannot shadow the actual mode.
  for (let row = viewportEnd - 1; row >= viewportStart; row -= 1) {
    const lineText = buffer.getLine(row)?.translateToString(true) ?? ''
    const indicatorMode = getVimVisualModeIndicator(lineText)
    if (indicatorMode) {
      modeIndicators.push({ row, text: lineText, mode: indicatorMode })
      mode = indicatorMode
      break
    }
  }

  if (!mode) {
    diagnose('mode-not-found', {
      bufferType: buffer.type,
      viewportStart,
      viewportEnd,
      bottomLines: Array.from({ length: Math.min(3, viewportEnd - viewportStart) }, (_, index) => {
        const row = viewportEnd - 1 - index
        return { row, text: buffer.getLine(row)?.translateToString(true) ?? '' }
      })
    })
    return null
  }

  const highlightedRows: HighlightedBufferRow[] = []
  for (let row = viewportStart; row < viewportEnd; row += 1) {
    const line = buffer.getLine(row)
    if (!line) {
      continue
    }

    let firstColumn = -1
    let lastColumn = -1
    for (let column = 0; column < terminal.cols; column += 1) {
      const cell = line.getCell(column)
      // Wide characters have a zero-width continuation cell. It has no text
      // of its own and must not move a selection boundary one column forward.
      if (!cell || cell.getWidth() === 0) {
        continue
      }
      if (!cell.isInverse() && cell.isBgDefault()) {
        continue
      }
      if (firstColumn === -1) {
        firstColumn = column
      }
      lastColumn = column + cell.getWidth()
    }

    if (firstColumn !== -1) {
      highlightedRows.push({ row, firstColumn, lastColumn })
    }
  }

  const cursorRow = buffer.baseY + buffer.cursorY
  const cursorColumn = buffer.cursorX
  const cursorCell = buffer.getLine(cursorRow)?.getCell(cursorColumn)
  const cursorCellWidth = cursorCell && cursorCell.getWidth() > 0 ? cursorCell.getWidth() : 1
  const cursorCellDetails = cursorCell
    ? {
        chars: cursorCell.getChars(),
        width: cursorCell.getWidth(),
        inverse: Boolean(cursorCell.isInverse()),
        backgroundDefault: cursorCell.isBgDefault(),
        foregroundDefault: cursorCell.isFgDefault()
      }
    : null
  let cursorRowIndex = highlightedRows.findIndex(
    ({ row, firstColumn, lastColumn }) => row === cursorRow && cursorColumn >= firstColumn && cursorColumn <= lastColumn
  )

  if (cursorRowIndex === -1) {
    // Vim's active Visual endpoint is drawn by xterm's cursor layer. That
    // overlay is not part of the buffer cell attributes, so the endpoint can
    // sit immediately before or after the inverse/background run even though
    // it is part of the same Vim selection.
    cursorRowIndex = highlightedRows.findIndex(
      ({ row, firstColumn, lastColumn }) =>
        row === cursorRow && (cursorColumn === firstColumn - 1 || cursorColumn === lastColumn)
    )
    if (cursorRowIndex !== -1) {
      const cursorRowHighlight = highlightedRows[cursorRowIndex]
      cursorRowHighlight.firstColumn = Math.min(cursorRowHighlight.firstColumn, cursorColumn)
      cursorRowHighlight.lastColumn = Math.max(cursorRowHighlight.lastColumn, cursorColumn + cursorCellWidth)
    }
  }

  if (cursorRowIndex === -1) {
    // A one-character Visual selection has no separately styled cells at all:
    // its only cell is covered by the cursor layer. The status marker and
    // mouse protocol already establish that this is Vim Visual mode, so copy
    // that current cell rather than incorrectly disabling Copy.
    const cursorLine = buffer.getLine(cursorRow)
    const text = cursorLine?.translateToString(false, cursorColumn, cursorColumn + cursorCellWidth) ?? ''
    diagnose('cursor-only', {
      mode,
      modeIndicators,
      cursorRow,
      cursorColumn,
      cursorCell: cursorCellDetails,
      highlightedRows,
      text
    })
    return text ? { text, mode, startRow: cursorRow, endRow: cursorRow } : null
  }

  // A Visual range is contiguous by row and always contains Vim's cursor.
  // Restricting the candidate to that contiguous run avoids status bars and
  // syntax groups elsewhere in the terminal buffer.
  let startIndex = cursorRowIndex
  while (startIndex > 0 && highlightedRows[startIndex - 1].row === highlightedRows[startIndex].row - 1) {
    startIndex -= 1
  }
  let endIndex = cursorRowIndex
  while (
    endIndex < highlightedRows.length - 1 &&
    highlightedRows[endIndex + 1].row === highlightedRows[endIndex].row + 1
  ) {
    endIndex += 1
  }

  const selectionRows = highlightedRows.slice(startIndex, endIndex + 1)
  const startRow = selectionRows[0]
  const endRow = selectionRows.at(-1)
  if (!endRow) {
    return null
  }

  const lines = selectionRows.map(({ row, firstColumn, lastColumn }, index) => {
    const line = buffer.getLine(row)
    if (!line) {
      return ''
    }

    if (mode === 'block') {
      return line.translateToString(true, firstColumn, lastColumn)
    }

    const selectionStart = index === 0 ? firstColumn : 0
    const selectionEnd = index === selectionRows.length - 1 ? lastColumn : terminal.cols
    return line.translateToString(true, selectionStart, selectionEnd)
  })
  const text = lines.join('\n')
  diagnose('highlighted-range', {
    mode,
    modeIndicators,
    cursorRow,
    cursorColumn,
    cursorCell: cursorCellDetails,
    highlightedRows,
    selectionRows,
    text
  })
  if (!text) {
    return null
  }

  return { text, mode, startRow: startRow.row, endRow: endRow.row }
}
