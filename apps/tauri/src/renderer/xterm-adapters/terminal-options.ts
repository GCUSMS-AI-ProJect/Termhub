import type { ITerminalOptions } from '@xterm/xterm'

export function getTerminalCompatibilityOptions(isWindowsPty: boolean): ITerminalOptions {
  return {
    // Adjacent block glyphs form TUI pixel art; extra spacing breaks the image.
    letterSpacing: 0,
    // Preserve dim text and graphical backgrounds while protecting text contrast.
    minimumContrastRatio: 4.5,
    // Option+drag keeps a local selection available while Vim owns mouse reporting.
    macOptionClickForcesSelection: true,
    reflowCursorLine: false,
    // ConPTY reprints screen rows during resize and keep-alive tab activation.
    windowsPty: isWindowsPty ? { backend: 'conpty' } : {},
    // TUI ED2 repaints must not push the cleared screen into scrollback.
    scrollOnEraseInDisplay: false
  }
}
