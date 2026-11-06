import type { IDisposable, Terminal } from '@xterm/xterm'

type UnicodeService = {
  charProperties(codepoint: number, preceding: number): number
}
type TerminalInternals = { _core?: { unicodeService?: UnicodeService } }

const CODEPOINT_MASK = 0x1fffff
const EXTENDED_PICTOGRAPHIC_FLAG = 1 << 21
const EMOJI = /^\p{Emoji}$/u
const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}$/u
const EMOJI_MODIFIER_BASE = /^\p{Emoji_Modifier_Base}$/u
const EXTENDED_PICTOGRAPHIC = /^\p{Extended_Pictographic}$/u

const matches = (property: RegExp, codepoint: number) => property.test(String.fromCodePoint(codepoint))
const isKeycapBase = (codepoint: number) =>
  codepoint === 0x23 || codepoint === 0x2a || (codepoint >= 0x30 && codepoint <= 0x39)
const isRegionalIndicator = (codepoint: number) => codepoint >= 0x1f1e6 && codepoint <= 0x1f1ff
const mayBeEmoji = (codepoint: number) =>
  codepoint === 0xa9 ||
  codepoint === 0xae ||
  (codepoint >= 0x203c && codepoint <= 0x3299) ||
  (codepoint >= 0x1f000 && codepoint <= 0x1ffff)
const isEmoji = (codepoint: number) => isKeycapBase(codepoint) || (mayBeEmoji(codepoint) && matches(EMOJI, codepoint))
const isEmojiPresentation = (codepoint: number) => mayBeEmoji(codepoint) && matches(EMOJI_PRESENTATION, codepoint)
const isExtendedPictographic = (codepoint: number) =>
  (codepoint === 0xa9 || codepoint === 0xae || mayBeEmoji(codepoint)) && matches(EXTENDED_PICTOGRAPHIC, codepoint)
const isEmojiModifier = (codepoint: number) => codepoint >= 0x1f3fb && codepoint <= 0x1f3ff

/** Keep xterm's buffer columns consistent with modern emoji grapheme clusters. */
export function registerTerminalEmojiWidths(terminal: Terminal): IDisposable {
  // shortcut: wraps xterm's private active provider because the public API cannot retrieve it; replace when xterm exposes that hook.
  const unicode = (terminal as unknown as TerminalInternals)._core?.unicodeService
  if (!unicode) return { dispose() {} }
  const original = unicode.charProperties
  if (typeof original !== 'function') return { dispose() {} }

  const adapted: UnicodeService['charProperties'] = (codepoint, preceding) => {
    const native = original.call(unicode, codepoint, preceding)
    const previousWidth = (preceding >>> 1) & 0x3
    const previousState = preceding >>> 3
    const previousCodepoint = previousState & CODEPOINT_MASK
    const previousEmojiCluster = (previousState & EXTENDED_PICTOGRAPHIC_FLAG) !== 0
    let width = (native >>> 1) & 0x3
    let shouldJoin = (native & 1) !== 0
    const hasPreceding = previousWidth > 0

    if (isEmojiPresentation(codepoint)) width = 2
    if (codepoint === 0xfe0f && hasPreceding && isEmoji(previousCodepoint)) {
      width = 2
      shouldJoin = true
    }
    if (codepoint === 0x20e3 && hasPreceding && isKeycapBase(previousCodepoint)) {
      width = 2
      shouldJoin = true
    }
    if (isEmojiModifier(codepoint) && hasPreceding && matches(EMOJI_MODIFIER_BASE, previousCodepoint)) {
      width = 2
      shouldJoin = true
    }
    if (
      codepoint !== 0x200d &&
      isExtendedPictographic(codepoint) &&
      previousCodepoint === 0x200d &&
      previousEmojiCluster &&
      hasPreceding
    ) {
      width = 2
      shouldJoin = true
    }
    if (isRegionalIndicator(codepoint)) {
      width = 2
      if (isRegionalIndicator(previousCodepoint) && hasPreceding && !(preceding & 1)) shouldJoin = true
    }

    const isVariationSelector = codepoint >= 0xfe00 && codepoint <= 0xfe0f
    const stateCodepoint = codepoint === 0xfe0f && isEmoji(previousCodepoint) ? previousCodepoint : codepoint
    const keepsEmojiCluster = width === 0 || codepoint === 0x200d || isVariationSelector || isEmojiModifier(codepoint)
    const isEmojiCluster =
      isExtendedPictographic(codepoint) || (previousEmojiCluster && shouldJoin && keepsEmojiCluster)
    const state = (stateCodepoint & CODEPOINT_MASK) | (isEmojiCluster ? EXTENDED_PICTOGRAPHIC_FLAG : 0)
    return (state << 3) | (width << 1) | (shouldJoin ? 1 : 0)
  }

  unicode.charProperties = adapted
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      if (unicode.charProperties === adapted) unicode.charProperties = original
    }
  }
}
