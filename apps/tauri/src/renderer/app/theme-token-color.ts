export function readThemeTokenColor(tokens: CSSStyleDeclaration, name: string, fallback: string): string {
  const color = tokens.getPropertyValue(name).trim()
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) return color
  if (!color || !CSS.supports('color', color)) return fallback

  const probe = document.createElement('span')
  probe.style.color = color
  probe.style.visibility = 'hidden'
  document.documentElement.append(probe)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) return fallback
    context.fillStyle = window.getComputedStyle(probe).color
    context.fillRect(0, 0, 1, 1)
    const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
    if (channels[3] === 255) channels.pop()
    return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
  } finally {
    probe.remove()
  }
}
