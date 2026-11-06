import { useEffect, type RefObject } from 'react'
import { APP_EVENT, onAppEvent } from '../../lib/app-events'
import type { useAiAttachments } from './use-ai-attachments'

export function useAiFileDrop(
  panel: RefObject<HTMLElement | null>,
  uploads: ReturnType<typeof useAiAttachments>,
  disabled: boolean
) {
  useEffect(() => {
    const off = onAppEvent(APP_EVENT.tauriNativeDrop, ({ paths, position, consume }) => {
      const ratio = window.devicePixelRatio || 1
      const target = document.elementFromPoint(position.x / ratio, position.y / ratio)
      if (!target || !panel.current?.contains(target)) return
      consume()
      if (!disabled) void uploads.addPaths(paths)
    })
    return off
  }, [panel, uploads.addPaths, disabled])
}
