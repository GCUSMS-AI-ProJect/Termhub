import type { IDisposable, Terminal } from '@xterm/xterm'

const MAX_SHARED_WIDTHS = 32768
type SharedMeasurements = {
  fonts: Map<string, Map<string, number>>
  entries: number
  users: number
  invalidate(): void
}
const measurementsByDocument = new WeakMap<Document, SharedMeasurements>()

// Document-lifetime listeners must not capture a per-terminal closure context.
function createSharedMeasurements(): SharedMeasurements {
  const fonts = new Map<string, Map<string, number>>()
  const state: SharedMeasurements = {
    fonts,
    entries: 0,
    users: 0,
    invalidate: () => {
      fonts.clear()
      state.entries = 0
    }
  }
  return state
}

type WidthCache = {
  _measureElements: HTMLElement[]
  _measure(chars: string, variant: number): number
  clear(): void
}
type TerminalInternals = {
  _core?: { _renderService?: { _renderer?: { value?: { _widthCache?: WidthCache } } } }
}

const FONT_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-stretch',
  'font-variant',
  'font-variant-ligatures',
  'font-variant-caps',
  'font-variant-numeric',
  'font-variant-east-asian',
  'font-variant-position',
  'font-variant-emoji',
  'font-feature-settings',
  'font-variation-settings',
  'font-optical-sizing',
  'font-size-adjust',
  'font-kerning',
  'font-synthesis',
  'font-language-override',
  'letter-spacing',
  'word-spacing',
  'line-height',
  'text-transform',
  'text-rendering',
  'text-spacing-trim',
  'text-autospace',
  'white-space',
  'direction',
  'writing-mode',
  'zoom'
] as const

/** Reuse measured widths only across identical font contexts in one WebView. */
export function registerSharedTerminalGlyphWidths(terminal: Terminal): IDisposable {
  const cache = (terminal as unknown as TerminalInternals)._core?._renderService?._renderer?.value?._widthCache
  const document = terminal.element?.ownerDocument
  const view = document?.defaultView
  if (
    !cache ||
    typeof cache._measure !== 'function' ||
    typeof cache.clear !== 'function' ||
    !Array.isArray(cache._measureElements) ||
    cache._measureElements?.length !== 4 ||
    !document ||
    !view ||
    !cache._measureElements.every((element) => element?.ownerDocument === document)
  )
    return { dispose() {} }

  let shared = measurementsByDocument.get(document)
  if (!shared) {
    shared = createSharedMeasurements()
    measurementsByDocument.set(document, shared)
    document.fonts?.addEventListener('loadingdone', shared.invalidate)
    document.fonts?.addEventListener('loadingerror', shared.invalidate)
  }
  shared.users++
  const state = shared
  const signatures: string[] = []
  const measure = cache._measure
  const clear = cache.clear
  const sharedMeasure: WidthCache['_measure'] = (chars, variant) => {
    if (chars.length > 64) return measure.call(cache, chars, variant)
    let signature = signatures[variant]
    if (signature === undefined) {
      const element = cache._measureElements[variant]
      if (!element) return measure.call(cache, chars, variant)
      const style = view.getComputedStyle(element)
      signature = JSON.stringify([
        view.devicePixelRatio,
        element.closest('[lang]')?.getAttribute('lang'),
        ...FONT_PROPERTIES.map((name) => style.getPropertyValue(name))
      ])
      signatures[variant] = signature
    }
    const cached = state.fonts.get(signature)?.get(chars)
    if (cached !== undefined) return cached
    const width = measure.call(cache, chars, variant)
    if (Number.isFinite(width) && width > 0) {
      if (state.entries >= MAX_SHARED_WIDTHS) state.invalidate()
      let widths = state.fonts.get(signature)
      if (!widths) {
        widths = new Map()
        state.fonts.set(signature, widths)
      }
      widths.set(chars, width)
      state.entries++
    }
    return width
  }
  const invalidate = () => {
    signatures.length = 0
    state.invalidate()
    clear.call(cache)
  }
  cache._measure = sharedMeasure
  cache.clear = invalidate
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      if (cache._measure === sharedMeasure) cache._measure = measure
      if (cache.clear === invalidate) cache.clear = clear
      if (--state.users === 0) {
        state.invalidate()
        document.fonts?.removeEventListener('loadingdone', state.invalidate)
        document.fonts?.removeEventListener('loadingerror', state.invalidate)
        measurementsByDocument.delete(document)
      }
    }
  }
}
