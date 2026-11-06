export type GlyphRect = { x: number; y: number; width: number; height: number }
type Band = { start: number; end: number }
const rectangleCache = new Map<string, GlyphRect[]>()

// Unicode box-drawing directions: up, right, down, left.
// 0 = absent, 1 = light, 2 = heavy, 3 = double. Special paths are handled below.
const BOX_LINES = [
  '0101 0202 1010 2020 0101 0202 1010 2020 0101 0202 1010 2020 0110 0210 0120 0220',
  '0011 0012 0021 0022 1100 1200 2100 2200 1001 1002 2001 2002 1110 1210 2110 1120',
  '2120 2210 1220 2220 1011 1012 2011 1021 2021 2012 1022 2022 0111 0112 0211 0212',
  '0121 0122 0221 0222 1101 1102 1201 1202 2101 2102 2201 2202 1111 1112 1211 1212',
  '2111 1121 2121 2112 2211 1122 1221 2212 1222 2122 2221 2222 0101 0202 1010 2020',
  '0303 3030 0310 0130 0330 0013 0031 0033 1300 3100 3300 1003 3001 3003 1310 3130',
  '3330 1013 3031 3033 0313 0131 0333 1303 3101 3303 1313 3131 3333 0110 0011 1001',
  '1100 0000 0000 0000 0001 1000 0100 0010 0002 2000 0200 0020 0201 1020 0102 2010'
].flatMap((row) => row.split(' '))

export function isBoxDrawingGlyph(codepoint: number) {
  return codepoint >= 0x2500 && codepoint <= 0x257f
}

function bands(size: number, style: number, light: number): Band[] {
  if (!style) return []
  const start = Math.floor((size - light) / 2)
  if (style === 3)
    return [
      { start: start - light, end: start },
      { start: start + light, end: start + 2 * light }
    ]
  const thickness = style === 2 ? light * 2 : light
  const edge = Math.floor((size - thickness) / 2)
  return [{ start: edge, end: edge + thickness }]
}

/** Integer device-pixel rectangles. Each arm meets the perpendicular stroke's
 * outer edge. Doubled arms meet the corresponding rail, leaving the central
 * channel open at corners, tees and crosses instead of filling a solid blob.
 */
export function getBoxDrawingRects(codepoint: number, width: number, height: number, thickness: number): GlyphRect[] {
  const key = `${codepoint}:${width}:${height}:${thickness}`
  const cached = rectangleCache.get(key)
  if (cached) return cached
  const rectangles = computeBoxDrawingRects(codepoint, width, height, thickness)
  // TUIs repeat a small set of cell sizes and line shapes. Bound the cache when
  // terminals with many fonts/DPI settings share this renderer module.
  if (rectangleCache.size >= 1024) rectangleCache.clear()
  rectangleCache.set(key, rectangles)
  return rectangles
}

function computeBoxDrawingRects(codepoint: number, width: number, height: number, thickness: number): GlyphRect[] {
  if (!isBoxDrawingGlyph(codepoint) || (codepoint >= 0x256d && codepoint <= 0x2573)) return []
  const light = Math.max(1, Math.min(thickness, Math.floor(Math.min(width, height) / 3)))
  const dashCount =
    codepoint >= 0x2504 && codepoint <= 0x250b
      ? codepoint < 0x2508
        ? 3
        : 4
      : codepoint >= 0x254c && codepoint <= 0x254f
        ? 2
        : 0
  if (dashCount) {
    const vertical = (codepoint & 2) !== 0
    const length = vertical ? height : width
    const stroke = bands(vertical ? width : height, codepoint & 1 ? 2 : 1, light)[0]
    return Array.from({ length: dashCount }, (_, index) => {
      const start = Math.round((index * length) / dashCount)
      const end = Math.max(start + 1, Math.round(((index + 0.65) * length) / dashCount))
      return vertical
        ? { x: stroke.start, y: start, width: stroke.end - stroke.start, height: end - start }
        : { x: start, y: stroke.start, width: end - start, height: stroke.end - stroke.start }
    })
  }

  const [up, right, down, left] = [...BOX_LINES[codepoint - 0x2500]].map(Number)
  const rectangles: GlyphRect[] = []
  // The same axis algorithm handles horizontal and vertical arms by transposing.
  const axis = (
    size: number,
    crossSize: number,
    negative: number,
    positive: number,
    crossNegative: number,
    crossPositive: number,
    transpose: boolean
  ) => {
    const crossBands = [bands(size, crossNegative, light), bands(size, crossPositive, light)]
    const allCrossBands = crossBands.flat()
    const center = bands(size, 1, light)[0]
    const innerStart = allCrossBands.length ? Math.min(...allCrossBands.map((band) => band.start)) : center.start
    const innerEnd = allCrossBands.length ? Math.max(...allCrossBands.map((band) => band.end)) : center.end
    for (const [direction, style] of [
      [-1, negative],
      [1, positive]
    ]) {
      bands(crossSize, style, light).forEach((band, rail) => {
        let endpoint = direction < 0 ? innerEnd : innerStart
        if (style === 3) {
          // Top/left rail connects toward the negative perpendicular arm;
          // bottom/right rail toward the positive arm. At an elbow the missing
          // arm uses the far rail, keeping two distinct nested bends.
          const near = rail === 0 ? crossNegative : crossPositive
          const far = rail === 0 ? crossPositive : crossNegative
          if (near === 3 || far === 3) {
            const doubleBands = bands(size, 3, light)
            const target = near === 3 ? (direction < 0 ? 0 : 1) : direction < 0 ? 1 : 0
            endpoint = direction < 0 ? doubleBands[target].end : doubleBands[target].start
          }
        }
        const start = direction < 0 ? 0 : endpoint
        const end = direction < 0 ? endpoint : size
        rectangles.push(
          transpose
            ? { x: band.start, y: start, width: band.end - band.start, height: end - start }
            : { x: start, y: band.start, width: end - start, height: band.end - band.start }
        )
      })
    }
  }
  axis(width, height, left, right, up, down, false)
  axis(height, width, up, down, left, right, true)
  return rectangles
}

export function drawBoxDrawingGlyph(
  context: CanvasRenderingContext2D,
  codepoint: number,
  x: number,
  width: number,
  height: number,
  thickness: number
) {
  context.beginPath()
  if (codepoint >= 0x256d && codepoint <= 0x2570) {
    const light = Math.max(1, Math.min(thickness, Math.floor(Math.min(width, height) / 3)))
    const cx = Math.floor((width - light) / 2) + light / 2
    const cy = Math.floor((height - light) / 2) + light / 2
    const right = codepoint === 0x256d || codepoint === 0x2570
    const down = codepoint === 0x256d || codepoint === 0x256e
    const dx = right ? 1 : -1
    const dy = down ? 1 : -1
    const radius = Math.max(0, Math.min(cx, width - cx, cy, height - cy) - light / 2)
    context.lineWidth = light
    context.lineCap = 'butt'
    context.moveTo(x + (right ? width : 0), cy)
    context.lineTo(x + cx + dx * radius, cy)
    context.quadraticCurveTo(x + cx, cy, x + cx, cy + dy * radius)
    context.lineTo(x + cx, down ? height : 0)
    context.stroke()
  } else if (codepoint >= 0x2571 && codepoint <= 0x2573) {
    context.lineWidth = thickness
    context.lineCap = 'square'
    if (codepoint !== 0x2572) {
      context.moveTo(x + width, 0)
      context.lineTo(x, height)
    }
    if (codepoint !== 0x2571) {
      context.moveTo(x, 0)
      context.lineTo(x + width, height)
    }
    context.stroke()
  } else {
    for (const rect of getBoxDrawingRects(codepoint, width, height, thickness)) {
      context.rect(x + rect.x, rect.y, rect.width, rect.height)
    }
    // Fill the union once: dim/transparent colors must not darken intersections.
    context.fill()
  }
}
