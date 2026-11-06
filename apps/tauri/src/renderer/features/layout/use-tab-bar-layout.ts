import { useEffect, useState } from 'react'
import { DEFAULT_TAB_BAR_LAYOUT, type TranstermDesktopApi, type TabBarLayout } from '@transterm/core'

function normalizeTabBarLayout(value: unknown): TabBarLayout {
  return value === 'host-groups' ? 'host-groups' : DEFAULT_TAB_BAR_LAYOUT
}

/**
 * The saved tab bar layout, kept current from preference events. Only the
 * settings page writes it; the setter is for its optimistic updates.
 */
export function useTabBarLayout(desktopApi: TranstermDesktopApi | undefined, initialLayout?: TabBarLayout) {
  const [tabBarLayout, setTabBarLayout] = useState(() => normalizeTabBarLayout(initialLayout))
  const hasInitialLayout = initialLayout !== undefined

  useEffect(() => {
    if (!desktopApi) {
      return
    }

    let canceled = false
    // Startup normally hands over the saved value; read it when that failed.
    if (!hasInitialLayout) {
      void desktopApi
        .getUiPreferences()
        .then((preferences) => {
          if (!canceled) setTabBarLayout(normalizeTabBarLayout(preferences.tabBarLayout))
        })
        .catch(() => {
          // Keep the default layout when the preference cannot be read.
        })
    }
    const unsubscribe = desktopApi.onUiPreferencesChanged((preferences) => {
      if (!canceled) setTabBarLayout(normalizeTabBarLayout(preferences.tabBarLayout))
    })

    return () => {
      canceled = true
      unsubscribe()
    }
  }, [desktopApi, hasInitialLayout])

  return [tabBarLayout, setTabBarLayout] as const
}
