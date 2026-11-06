import type { IBufferCell, IBufferLine, IDisposable, ITheme, Terminal } from '@xterm/xterm'
import { DIAGNOSTIC_SCOPES, writeDiagnosticLog } from '../lib/diagnostic-log'

export type TerminalLogColorPalette = Readonly<{
  timestamp: string
  service: string
  error: string
  warning: string
  success: string
  info: string
  debug: string
  address: string
  number: string
  permission: string
  flag: string
}>

type LogColorKey = keyof TerminalLogColorPalette

type InternalBufferLine = {
  length: number
  _data: Uint32Array
}

type InternalLineView = InternalBufferLine & {
  _line?: InternalBufferLine
}

type LineOriginals = {
  foreground: Uint32Array
  content: Uint32Array
  mask: Uint8Array
}

type ColorMatch = {
  start: number
  end: number
  priority: number
  rgb: number
}

type CompiledRule = {
  priority: number
  rgb: number
  pattern: RegExp
}

const CELL_INDICES = 3
const CELL_CONTENT = 0
const CELL_FOREGROUND = 1
const STYLE_MASK = 0xfc000000
const FOREGROUND_INVERSE = 0x04000000
const COLOR_MODE_RGB = 0x03000000
const MAX_RECOLOR_LINES_PER_WRITE = 384

// Rules provide rich semantic highlighting for terminal logs, commands,
// file listings, permissions, and numeric metrics while strictly avoiding
// false positives inside package paths, URLs, and filenames.
const LOG_COLOR_RULE_DEFINITIONS: ReadonlyArray<{
  color: LogColorKey
  pattern: string
}> = [
  {
    color: 'error',
    pattern:
      '(?<![./\\-_@\\w])(?:error|err|failed|failure|fatal|critical|exception|panic|denied|refused|unauthori[sz]ed|oom|killed|segmentation\\s+fault)(?![./\\-_@\\w])'
  },
  {
    color: 'warning',
    pattern: '(?<![./\\-_@\\w])(?:warn(?:ing)?|caution|deprecated|retry|retries|backoff)(?![./\\-_@\\w])'
  },
  {
    color: 'success',
    pattern: '(?<![./\\-_@\\w])(?:ok|success(?:ful)?|passed|done|ready)(?![./\\-_@\\w])'
  },
  {
    color: 'info',
    pattern: '(?<![./\\-_@\\w])(?:info|notice|note)(?![./\\-_@\\w])'
  },
  {
    color: 'debug',
    pattern: '(?<![./\\-_@\\w])(?:debug|trace|verbose)(?![./\\-_@\\w])'
  },
  {
    color: 'timestamp',
    pattern:
      '(?:\\b\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}[T ]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?\\b|\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2}\\s+(?:\\d{2}:\\d{2}(?::\\d{2})?(?:[.,]\\d+)?|\\d{4})\\b|(?:\\d{1,2}月\\s+)?\\d{1,2}\\s+\\d{2}:\\d{2}(?::\\d{2})?(?:[.,]\\d+)?(?:\\s+\\d{4})?|\\b\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s+\\d{2}:\\d{2}(?::\\d{2})?\\b)'
  },
  {
    color: 'address',
    pattern:
      '(?:\\bhttps?:\\/\\/[^\\s]+|\\b(?:\\d{1,3}\\.){3}\\d{1,3}(?::\\d{1,5})?\\b|\\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b)'
  },
  {
    color: 'permission',
    pattern: '(?<!\\S)[-dlcbsp][-rwxstST]{9}(?!\\S)'
  },
  {
    color: 'service',
    pattern: '(?:\\b[A-Za-z][A-Za-z0-9_.@/\\[\\]-]*(?:\\[\\d+\\])?)(?=\\s*:\\s)'
  },
  {
    color: 'flag',
    pattern: '(?<=\\s|^)(?:--[a-zA-Z0-9][a-zA-Z0-9_-]*|-[a-zA-Z0-9]+)(?=\\s|$|[,;:=])'
  },
  {
    color: 'number',
    pattern: '(?<![./\\-_@\\w])\\d+(?:\\.\\d+)?(?:ms|s|m|h|d|k|m|g|t|kb|mb|gb|tb|b|%|px|em|rem)?(?![./\\-_@\\w])'
  }
]

function parseRgb(value: string): number | null {
  const normalized = value.trim()
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(normalized)
  const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})(?:[\da-f]{2})?$/i.exec(normalized)
  const components = full ? full.slice(1) : short ? short.slice(1).map((component) => component.repeat(2)) : null
  if (!components) {
    return null
  }

  return components.reduce((result, component) => (result << 8) | Number.parseInt(component, 16), 0)
}

function withRgbForeground(original: number, rgb: number): number {
  // xterm renders inverse cells by swapping foreground and background. The
  // shell line editor uses that mode for parts of the echoed command, so
  // preserving it would turn this foreground-only semantic color into a
  // filled block. Keep the other foreground styles, but make recoloring
  // explicitly foreground-only.
  return (original & STYLE_MASK & ~FOREGROUND_INVERSE) | COLOR_MODE_RGB | (rgb & 0xffffff)
}

function getInternalLine(line: IBufferLine | undefined): InternalBufferLine | null {
  if (!line) {
    return null
  }

  const view = line as unknown as InternalLineView
  if (view._line?._data) {
    return view._line
  }
  if (view._data) {
    return view
  }
  return null
}

function collectMatches(text: string, rules: readonly CompiledRule[]): ColorMatch[] {
  const matches: ColorMatch[] = []
  for (const rule of rules) {
    rule.pattern.lastIndex = 0
    for (const match of text.matchAll(rule.pattern)) {
      const start = match.index ?? -1
      const length = match[0].length
      if (start < 0 || length === 0) {
        continue
      }
      matches.push({
        start,
        end: start + length,
        priority: rule.priority,
        rgb: rule.rgb
      })
    }
  }

  matches.sort((left, right) => left.start - right.start || left.priority - right.priority || right.end - left.end)
  const accepted: ColorMatch[] = []
  for (const match of matches) {
    if (accepted.length === 0 || match.start >= accepted[accepted.length - 1].end) {
      accepted.push(match)
    }
  }
  return accepted
}

function createPaletteFromTheme(theme: ITheme | undefined): TerminalLogColorPalette {
  const pick = (value: string | undefined, fallback: string) => value || fallback
  return {
    timestamp: pick(theme?.brightGreen, pick(theme?.green, '#39d98a')),
    service: pick(theme?.brightYellow, pick(theme?.yellow, '#eab308')),
    error: pick(theme?.brightRed, pick(theme?.red, '#e05555')),
    warning: pick(theme?.brightYellow, pick(theme?.yellow, '#f59e0b')),
    success: pick(theme?.brightGreen, pick(theme?.green, '#34d399')),
    info: pick(theme?.brightBlue, pick(theme?.blue, '#38bdf8')),
    debug: pick(theme?.brightMagenta, pick(theme?.magenta, '#c084fc')),
    address: pick(theme?.brightCyan, pick(theme?.cyan, '#22d3ee')),
    number: pick(theme?.brightMagenta, pick(theme?.magenta, '#c084fc')),
    permission: pick(theme?.brightYellow, pick(theme?.yellow, '#f59e0b')),
    flag: pick(theme?.brightYellow, pick(theme?.yellow, '#fde047'))
  }
}

export function getTerminalLogColorPalette(theme: ITheme | undefined): TerminalLogColorPalette {
  return createPaletteFromTheme(theme)
}

/**
 * Applies optional log colors after xterm has parsed a write.
 *
 * This deliberately mutates xterm's parsed cell foregrounds instead of
 * injecting SGR sequences into the stream. Remote ANSI remains intact in the
 * transcript and in copy/serialization paths, while plain journal/system log
 * lines can still get semantic colors. Alternate-screen
 * applications (top, vim, less, etc.) are left untouched.
 */
export class TerminalLogColorizer implements IDisposable {
  private readonly originalWrite: Terminal['write']
  private readonly originalReset: Terminal['reset']
  private readonly originalClear: Terminal['clear']
  private readonly originalResize: Terminal['resize']
  private readonly originals = new WeakMap<InternalBufferLine, LineOriginals>()
  private rules: CompiledRule[] = []
  private paletteKey = ''
  private readonly cell: IBufferCell
  private disposed = false
  private failed = false
  private readonly terminal: Terminal

  constructor(terminal: Terminal, palette: TerminalLogColorPalette) {
    this.terminal = terminal
    this.cell = terminal.buffer.normal.getNullCell()
    this.originalWrite = terminal.write.bind(terminal)
    this.originalReset = terminal.reset.bind(terminal)
    this.originalClear = terminal.clear.bind(terminal)
    this.originalResize = terminal.resize.bind(terminal)
    this.setPalette(palette, false)
    terminal.write = this.write
    terminal.reset = this.reset
    terminal.clear = this.clear
    terminal.resize = this.resize
  }

  setPalette(palette: TerminalLogColorPalette, recolor = true): void {
    const colors = LOG_COLOR_RULE_DEFINITIONS.map((definition) => parseRgb(palette[definition.color]))
    const paletteKey = colors.join(',')
    if (paletteKey === this.paletteKey) return
    this.paletteKey = paletteKey
    const nextRules = LOG_COLOR_RULE_DEFINITIONS.flatMap((definition, priority) => {
      const rgb = colors[priority]
      if (rgb === null) {
        return []
      }
      return [{ priority, rgb, pattern: new RegExp(definition.pattern, 'gi') }]
    })
    this.rules = nextRules
    if (recolor && !this.disposed && !this.failed) {
      this.recolorAll()
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    if (!this.failed) this.restoreBuffer()
    this.terminal.write = this.originalWrite
    this.terminal.reset = this.originalReset
    this.terminal.clear = this.originalClear
    this.terminal.resize = this.originalResize
  }

  private readonly write: Terminal['write'] = (data, callback) => {
    if (this.disposed || this.failed) {
      this.originalWrite(data, callback)
      return
    }

    const startedInNormalBuffer = this.terminal.buffer.active.type === 'normal'
    const marker = startedInNormalBuffer ? this.terminal.registerMarker(0) : undefined
    try {
      this.originalWrite(data, () => {
        try {
          const active = this.terminal.buffer.active
          if (!this.disposed && !this.failed && active.type === 'normal') {
            const endY = active.baseY + active.cursorY
            const markerY = marker && !marker.isDisposed ? marker.line : Math.max(0, endY - MAX_RECOLOR_LINES_PER_WRITE)
            this.recolorRange(markerY, endY, true)
          }
        } catch {
          // Optional colors must never interrupt xterm's parser or retain display credit.
          this.failed = true
          writeDiagnosticLog('WARN', DIAGNOSTIC_SCOPES.performance, 'terminal log coloring disabled after failure')
        } finally {
          marker?.dispose()
          callback?.()
        }
      })
    } catch (error) {
      marker?.dispose()
      throw error
    }
  }

  private readonly reset: Terminal['reset'] = () => {
    if (!this.failed) this.clearStoredOriginals()
    return this.originalReset()
  }

  private readonly clear: Terminal['clear'] = () => {
    if (this.failed) return this.originalClear()
    this.clearStoredOriginals()
    const result = this.originalClear()
    if (this.terminal.buffer.active.type === 'normal') {
      this.terminal.refresh(0, Math.max(this.terminal.rows - 1, 0))
    }
    return result
  }

  private readonly resize: Terminal['resize'] = (cols, rows) => {
    if (this.failed) return this.originalResize(cols, rows)
    // A file-panel toggle changes the terminal height and therefore its row
    // count while keeping the column count stable. xterm preserves the
    // existing BufferLine cell data for row-only resizes, so restoring every
    // semantic foreground before each animation frame briefly exposes the
    // uncolored buffer and causes visible flicker. Only column changes can
    // reflow the buffer and require a restore/recolor pass.
    const columnsChanged = this.terminal.cols !== cols
    if (columnsChanged) {
      this.restoreBuffer()
    }
    const result = this.originalResize(cols, rows)
    if (columnsChanged) {
      this.recolorAll()
    }
    return result
  }

  private recolorAll(): void {
    const buffer = this.terminal.buffer.normal
    this.recolorRange(0, buffer.length - 1, true)
  }

  private recolorRange(startY: number, endY: number, refresh: boolean): void {
    const buffer = this.terminal.buffer.normal
    const first = Math.max(0, Math.min(startY, endY))
    const last = Math.min(buffer.length - 1, Math.max(startY, endY))
    if (last < first) {
      return
    }

    let changedFirst = Infinity
    let changedLast = -1
    for (let y = first; y <= last; y += 1) {
      if (this.recolorLine(y)) {
        changedFirst = Math.min(changedFirst, y)
        changedLast = y
      }
    }

    if (refresh && this.terminal.buffer.active.type === 'normal') {
      const viewportY = this.terminal.buffer.active.viewportY
      const startRow = Math.max(0, changedFirst - viewportY)
      const endRow = Math.min(this.terminal.rows - 1, changedLast - viewportY)
      if (startRow <= endRow) {
        this.terminal.refresh(startRow, endRow)
      }
    }
  }

  private recolorLine(y: number): boolean {
    const line = this.terminal.buffer.normal.getLine(y)
    const internal = getInternalLine(line)
    if (!line || !internal) {
      return false
    }

    // Most agent output is plain text: only build a per-cell map for actual matches.
    const matches = collectMatches(line.translateToString(true), this.rules)
    if (matches.length === 0) return this.restorePhysicalLine(internal)
    const columns = this.readColumns(line)
    const ranges = matches.flatMap((match) => {
      const start = columns[match.start]
      const end = columns[match.end - 1]
      return start === undefined || end === undefined ? [] : [{ start, end: end + 1, rgb: match.rgb }]
    })
    // Retain colors that still apply; restoring them first would force another DOM redraw.
    let changed = this.restorePhysicalLine(internal, ranges)
    for (const range of ranges) {
      changed = this.colorPhysicalRange(internal, range.start, range.end, range.rgb) || changed
    }
    return changed
  }

  private readColumns(line: IBufferLine): number[] {
    const columns: number[] = []
    for (let column = 0; column < line.length; column += 1) {
      const cell = line.getCell(column, this.cell)
      if (!cell || cell.getWidth() === 0) continue
      const chars = cell.getChars() || ' '
      for (let offset = 0; offset < chars.length; offset += 1) {
        columns.push(column)
      }
    }
    return columns
  }

  private colorPhysicalRange(line: InternalBufferLine, start: number, end: number, rgb: number): boolean {
    const originals = this.ensureOriginals(line)
    const last = Math.min(line.length, end)
    let changed = false
    for (let column = Math.max(0, start); column < last; column += 1) {
      const dataIndex = column * CELL_INDICES
      if (dataIndex + CELL_FOREGROUND >= line._data.length) {
        continue
      }
      const content = line._data[dataIndex + CELL_CONTENT]
      const foreground = line._data[dataIndex + CELL_FOREGROUND]
      if (!originals.mask[column] || originals.content[column] !== content) {
        originals.foreground[column] = foreground
        originals.content[column] = content
        originals.mask[column] = 1
      }
      const next = withRgbForeground(originals.foreground[column], rgb)
      if (foreground !== next) {
        line._data[dataIndex + CELL_FOREGROUND] = next
        changed = true
      }
    }
    return changed
  }

  private restorePhysicalLine(
    line: InternalBufferLine,
    retained: readonly { start: number; end: number }[] = []
  ): boolean {
    const originals = this.originals.get(line)
    if (!originals) {
      return false
    }

    let changed = false
    let range = 0
    for (let column = 0; column < line.length; column += 1) {
      while (range < retained.length && column >= retained[range].end) range++
      if (range < retained.length && column >= retained[range].start) continue
      if (!originals.mask[column]) {
        continue
      }
      const dataIndex = column * CELL_INDICES
      if (dataIndex + CELL_FOREGROUND >= line._data.length) {
        originals.mask[column] = 0
        continue
      }
      const content = line._data[dataIndex + CELL_CONTENT]
      if (originals.content[column] === content) {
        changed ||= line._data[dataIndex + CELL_FOREGROUND] !== originals.foreground[column]
        line._data[dataIndex + CELL_FOREGROUND] = originals.foreground[column]
      }
      originals.mask[column] = 0
    }
    return changed
  }

  private restoreBuffer(): void {
    const buffer = this.terminal.buffer.normal
    for (let y = 0; y < buffer.length; y += 1) {
      const internal = getInternalLine(buffer.getLine(y))
      if (internal) {
        this.restorePhysicalLine(internal)
      }
    }
  }

  private ensureOriginals(line: InternalBufferLine): LineOriginals {
    const current = this.originals.get(line)
    if (current && current.foreground.length >= line.length) {
      return current
    }

    const next: LineOriginals = {
      foreground: new Uint32Array(line.length),
      content: new Uint32Array(line.length),
      mask: new Uint8Array(line.length)
    }
    this.originals.set(line, next)
    return next
  }

  private clearStoredOriginals(): void {
    // WeakMap entries are collected with xterm's BufferLine objects. Restoring
    // before clearing is enough; a new BufferLine never reuses our snapshots.
    this.restoreBuffer()
  }
}
