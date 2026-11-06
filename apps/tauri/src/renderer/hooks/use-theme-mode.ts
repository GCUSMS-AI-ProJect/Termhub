import { useEffect } from 'react'
import type { ThemeConfig } from '@transterm/core'
import { applyThemeVariables, clearThemeVariables, type ThemeMode } from '../app/theme-config'

export type { ThemeMode } from '../app/theme-config'

export function useThemeMode(themeName: ThemeMode = 'transterm-dark', themeConfig?: ThemeConfig) {
  useEffect(() => {
    applyThemeVariables(themeName, themeConfig)
    return () => {
      clearThemeVariables()
      document.documentElement.style.removeProperty('color-scheme')
    }
  }, [themeConfig, themeName])
}
