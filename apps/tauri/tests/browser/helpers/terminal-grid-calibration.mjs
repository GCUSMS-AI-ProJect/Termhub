// Test-only normalization: production DOM keeps its fractional font metrics.
export function registerComparisonGridCalibration(terminal, backend) {
  const core = terminal._core
  const renderer = core?._renderService?._renderer?.value
  const measure = core?._charSizeService
  const browser = core?._coreBrowserService
  if (
    !['dom', 'webgl'].includes(backend) ||
    typeof renderer?._updateDimensions !== 'function' ||
    typeof renderer?.handleCharSizeChanged !== 'function' ||
    !renderer?.dimensions?.css?.cell ||
    !measure ||
    !browser ||
    (backend === 'dom' && typeof renderer._setDefaultSpacing !== 'function')
  )
    throw new Error('Unsupported xterm grid internals; recheck xterm 6 / WebGL 0.19 before comparing')

  const original = renderer._updateDimensions
  const update = function () {
    const width = measure.width
    const dpr = browser.dpr
    // WebGL keeps glyph origins on physical pixels. Normalize only the experimental DOM arm.
    if (backend === 'dom' && width > 0 && dpr > 0) measure.width = Math.floor(width * dpr) / dpr
    try {
      original.call(renderer)
    } finally {
      measure.width = width
    }
    // CSS canvas sizes are rounded; hit testing must use the actual displayed cell grid.
    const css = renderer.dimensions.css
    css.cell.width = css.canvas.width / terminal.cols
    css.cell.height = css.canvas.height / terminal.rows
    if (backend === 'dom') renderer._setDefaultSpacing()
  }
  renderer._updateDimensions = update
  try {
    renderer.handleCharSizeChanged()
    terminal.refresh(0, terminal.rows - 1)
  } catch (error) {
    renderer._updateDimensions = original
    throw error
  }
  return {
    dispose() {
      if (renderer._updateDimensions !== update) return
      renderer._updateDimensions = original
      renderer.handleCharSizeChanged()
      terminal.refresh(0, terminal.rows - 1)
    }
  }
}

export function readComparisonGridMetrics(terminal) {
  const core = terminal._core
  const { css, device } = core._renderService._renderer.value.dimensions
  return {
    dpr: core._coreBrowserService.dpr,
    fontFamily: terminal.options.fontFamily,
    fontSize: terminal.options.fontSize,
    measuredWidth: core._charSizeService.width,
    cols: terminal.cols,
    rows: terminal.rows,
    deviceCellWidth: device.cell.width,
    deviceCellHeight: device.cell.height,
    cellWidth: css.cell.width,
    cellHeight: css.cell.height,
    canvasWidth: css.canvas.width,
    canvasHeight: css.canvas.height
  }
}
