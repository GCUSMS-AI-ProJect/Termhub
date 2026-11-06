import {
  createCodexThemeConfig,
  createDefaultThemeConfig,
  normalizeThemeConfig,
  type SavedTheme,
  type ThemeConfig,
  type ThemeVariant
} from '@transterm/core'

export function baseThemeConfigFor(config: ThemeConfig, variant: ThemeVariant): ThemeConfig | null {
  if (config.baseThemeId === 'codex' || config.codeThemeId === 'codex') return createCodexThemeConfig(variant)
  if (config.baseThemeId === 'transterm' || config.codeThemeId === 'transterm') return createDefaultThemeConfig(variant)
  return null
}

function sameValue(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' && typeof right === 'string' && /^#[\da-f]+$/i.test(left)) {
    return left.toUpperCase() === right.toUpperCase()
  }
  return left === right
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function transferValue(source: unknown, sourceBase: unknown, targetBase: unknown): unknown {
  if (sameValue(source, sourceBase)) return targetBase
  if (isRecord(source) && isRecord(sourceBase) && isRecord(targetBase)) {
    return Object.fromEntries(
      [...new Set([...Object.keys(targetBase), ...Object.keys(source)])].map((key) => [
        key,
        transferValue(source[key], sourceBase[key], targetBase[key])
      ])
    )
  }
  return source
}

const SURFACE_KEYS = [
  'surface',
  'surfaceSecondary',
  'surfaceElevated',
  'surfaceSidebar',
  'surfaceInput',
  'surfaceContextMenu'
] as const

/** Repair the old switcher's opposite-mode surfaces paired with current-mode ink. */
export function repairThemeVariant(config: ThemeConfig): ThemeConfig {
  const current = normalizeThemeConfig(config, config.variant)
  const base = baseThemeConfigFor(current, current.variant)
  const opposite = baseThemeConfigFor(current, current.variant === 'light' ? 'dark' : 'light')
  if (
    !base ||
    !opposite ||
    current.theme.overrides ||
    !sameValue(current.theme.ink, base.theme.ink) ||
    !SURFACE_KEYS.every((key) => sameValue(current.theme[key], opposite.theme[key]))
  ) {
    return current
  }
  return {
    ...current,
    theme: { ...current.theme, ...Object.fromEntries(SURFACE_KEYS.map((key) => [key, base.theme[key]])) }
  }
}

/** Follow the base palette per field, retaining only actual user customizations. */
export function deriveThemeVariant(config: ThemeConfig, targetVariant: ThemeVariant): ThemeConfig {
  const source = repairThemeVariant(config)
  if (source.variant === targetVariant) return source
  const sourceBase = baseThemeConfigFor(source, source.variant) ?? createDefaultThemeConfig(source.variant)
  const targetBase = baseThemeConfigFor(source, targetVariant) ?? createDefaultThemeConfig(targetVariant)
  return normalizeThemeConfig(
    {
      ...targetBase,
      codeThemeId: source.codeThemeId,
      baseThemeId: source.baseThemeId ?? targetBase.baseThemeId,
      theme: transferValue(source.theme, sourceBase.theme, targetBase.theme)
    },
    targetVariant
  )
}

export function getSavedThemeConfig(savedTheme: SavedTheme, variant: ThemeVariant): ThemeConfig {
  const directVariant = savedTheme.variants?.[variant]
  if (directVariant) return repairThemeVariant({ ...directVariant, variant })
  return deriveThemeVariant(savedTheme.config, variant)
}

export function normalizeSavedTheme(savedTheme: SavedTheme): SavedTheme {
  const current = repairThemeVariant(savedTheme.config)
  return {
    ...savedTheme,
    config: current,
    variants: {
      dark: savedTheme.variants?.dark
        ? repairThemeVariant({ ...savedTheme.variants.dark, variant: 'dark' })
        : deriveThemeVariant(current, 'dark'),
      light: savedTheme.variants?.light
        ? repairThemeVariant({ ...savedTheme.variants.light, variant: 'light' })
        : deriveThemeVariant(current, 'light')
    }
  }
}
