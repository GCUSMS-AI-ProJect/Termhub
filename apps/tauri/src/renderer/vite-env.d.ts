/// <reference types="vite/client" />
import type { TranstermDesktopApi } from '@transterm/core'

declare global {
  interface Window {
    transterm?: TranstermDesktopApi
  }
}

export {}
