export function buildAiFileExcerpt(content: string, path: string, source: string, from: number, to: number) {
  const lines = content.split(/\r?\n/)
  const first = Math.max(1, Math.min(lines.length, Math.floor(Number.isFinite(from) ? from : 1)))
  const last = Math.max(first, Math.min(lines.length, Math.floor(Number.isFinite(to) ? to : first)))
  const selected = lines.slice(first - 1, last).join('\n')
  const text = `Source: ${source} ${path}\nLines: ${first}-${last}\n\n${selected}`
  const size = new TextEncoder().encode(text).length
  const basename = [...(path.split(/[\\/]/).pop() || 'context')]
    .filter((char) => char.charCodeAt(0) >= 32)
    .slice(0, 180)
    .join('')
  return { name: `${basename}.L${first}-${last}.txt`, text, size, first, last, selected }
}
