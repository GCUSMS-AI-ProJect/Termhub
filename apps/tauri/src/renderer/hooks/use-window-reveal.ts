import { useEffect } from 'react'
import { showCurrentWindow } from '../../bridge/tauri-api'

/** Keep native windows hidden until their data and first React frame are ready. */
export function useWindowReveal(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    let revealed = false
    let firstFrame: number | null = null
    let secondFrame: number | null = null
    const fallbackTimer = window.setTimeout(reveal, 250)

    function reveal() {
      if (cancelled || revealed) return
      revealed = true
      window.clearTimeout(fallbackTimer)
      void showCurrentWindow().catch((error: unknown) => {
        console.error('Failed to reveal the window after initial paint:', error)
      })
    }

    firstFrame = requestAnimationFrame(() => {
      firstFrame = null
      secondFrame = requestAnimationFrame(() => {
        secondFrame = null
        reveal()
      })
    })

    return () => {
      cancelled = true
      window.clearTimeout(fallbackTimer)
      if (firstFrame !== null) cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) cancelAnimationFrame(secondFrame)
    }
  }, [ready])
}
