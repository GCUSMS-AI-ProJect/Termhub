// These widths are the table producer's contract, independent of xterm's provider.
export const terminalSymbolCases = [
  ['A', 1], // ASCII controls for both wall styles.
  ['A', 1],
  ['✻', 1],
  ['※', 1],
  ['①', 1],
  ['•', 1],
  ['○', 1],
  ['■', 1],
  ['§', 1],
  ['±', 1],
  ['×', 1],
  ['⚠', 1],
  ['✔', 1],
  ['✖', 1],
  ['⚠︎', 1],
  ['✅', 2],
  ['❌', 2],
  ['🚀', 2],
  ['🐛', 2],
  ['🔥', 2],
  ['⚠️', 2],
  ['✔️', 2],
  ['✖️', 2],
  ['ℹ️', 2],
  ['⚙️', 2],
  ['☁️', 2],
  ['©️', 2],
  ['®️', 2],
  ['™️', 2],
  ['1️⃣', 2],
  ['9️⃣', 2],
  ['#️⃣', 2],
  ['🇨🇳', 2],
  ['👍🏽', 2],
  ['👨‍💻', 2],
  ['🏳️‍⚧️', 2],
  ['👩🏽‍🚀', 2],
  ['👨‍👩‍👧‍👦', 2]
]

export const terminalSymbolTable = terminalSymbolCases
  .map(([glyph, width], index) => {
    const wall = index % 2 ? '│' : '|'
    return `${wall} ${glyph}${' '.repeat(8 - width)}${wall} Row${String(index).padStart(2, '0')}       ${wall}`
  })
  .join('\r\n')

// Eight columns catch cumulative drift that a one-symbol-per-row table cannot.
export const terminalSymbolGridRows = [
  Array.from({ length: 8 }, () => ['A', 1]),
  ...Array.from({ length: Math.ceil(terminalSymbolCases.length / 8) }, (_, row) =>
    Array.from({ length: 8 }, (_, column) => terminalSymbolCases[row * 8 + column] || ['A', 1])
  )
]
export const terminalSymbolGrid = terminalSymbolGridRows
  .map((cells) => '│' + cells.map(([glyph, width]) => ` ${glyph}${' '.repeat(8 - width)}│`).join(''))
  .join('\r\n')
