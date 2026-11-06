import type { IDisposable, Terminal } from '@xterm/xterm'
import { registerSharedTerminalGlyphWidths } from './terminal-shared-glyph-widths'

const MAX_CONTRAST_PAIRS = 8192
const MAX_GLYPH_WIDTHS = 16384

type ContrastCache = {
  clear(): void
  setCss(background: number, foreground: number, value: unknown): void
  setColor(background: number, foreground: number, value: unknown): void
}
type WidthCache = {
  _holey?: Map<string, number>
  get(chars: string, bold: boolean | number, italic: boolean | number): number
}
type TerminalInternals = {
  _core?: {
    _themeService?: { colors?: { contrastCache?: ContrastCache; halfContrastCache?: ContrastCache } }
    _renderService?: { _renderer?: { value?: { _widthCache?: WidthCache } } }
  }
}

/** xterm 6's DOM memoization otherwise retains every RGB pair/combined glyph. */
export function registerTerminalRenderCacheLimits(terminal: Terminal): IDisposable {
  const core = (terminal as unknown as TerminalInternals)._core
  const restore: Array<() => void> = []
  for (const cache of new Set([
    core?._themeService?.colors?.contrastCache,
    core?._themeService?.colors?.halfContrastCache
  ])) {
    if (
      !cache ||
      typeof cache.clear !== 'function' ||
      typeof cache.setCss !== 'function' ||
      typeof cache.setColor !== 'function'
    )
      continue
    const pairs = new Set<string>()
    const clear = cache.clear
    const clearBounded = () => {
      pairs.clear()
      clear.call(cache)
    }
    cache.clear = clearBounded
    // Install immediately after open, before the first paint populates caches.
    clearBounded()
    for (const method of ['setCss', 'setColor'] as const) {
      const original = cache[method]
      const bounded = (background: number, foreground: number, value: unknown) => {
        const key = `${background}:${foreground}`
        if (!pairs.has(key)) {
          if (pairs.size >= MAX_CONTRAST_PAIRS) clearBounded()
          pairs.add(key)
        }
        original.call(cache, background, foreground, value)
      }
      cache[method] = bounded
      restore.push(() => {
        if (cache[method] === bounded) cache[method] = original
      })
    }
    restore.push(() => {
      if (cache.clear === clearBounded) cache.clear = clear
      pairs.clear()
    })
  }
  const widths = core?._renderService?._renderer?.value?._widthCache
  if (widths && typeof widths.get === 'function' && widths._holey instanceof Map) {
    const original = widths.get
    const bounded: WidthCache['get'] = (chars, bold, italic) => {
      // Evict only memoized measurements; retain the calibrated font and the
      // fast ASCII table. Existing cell geometry and scrollback are untouched.
      if (widths._holey && widths._holey.size >= MAX_GLYPH_WIDTHS) widths._holey.clear()
      return original.call(widths, chars, bold, italic)
    }
    widths.get = bounded
    restore.push(() => {
      if (widths.get === bounded) widths.get = original
    })
  }
  // shortcut: private xterm 6 cache shapes; recheck this adapter on xterm upgrades.
  const sharedWidths = registerSharedTerminalGlyphWidths(terminal)
  restore.push(() => sharedWidths.dispose())
  return {
    dispose: () => {
      restore.splice(0).forEach((reset) => reset())
    }
  }
}
