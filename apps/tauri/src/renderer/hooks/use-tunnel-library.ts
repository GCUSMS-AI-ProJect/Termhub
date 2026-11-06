import { useCallback, useEffect, useState } from 'react'
import type { CreateTunnelProfileInput, TunnelProfile, UpdateTunnelProfileInput } from '@transterm/core'

export function useTunnelLibrary() {
  const [tunnels, setTunnels] = useState<TunnelProfile[]>([])
  const [loading, setLoading] = useState(Boolean(window.transterm))
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const desktopApi = window.transterm
    if (!desktopApi) {
      setTunnels([])
      setLoading(false)
      return
    }
    try {
      setTunnels(await desktopApi.listTunnelProfiles())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    const stop = window.transterm?.onTunnelsChanged?.(() => void reload())
    return () => stop?.()
  }, [reload])

  const saveTunnel = useCallback(async (input: CreateTunnelProfileInput | UpdateTunnelProfileInput) => {
    const desktopApi = window.transterm
    if (!desktopApi) throw new Error('桌面 API 不可用')
    const saved = await desktopApi.saveTunnelProfile(input)
    setTunnels((previous) => {
      const withoutSaved = previous.filter((tunnel) => tunnel.id !== saved.id)
      return [saved, ...withoutSaved]
    })
    setError(null)
    return saved
  }, [])

  const deleteTunnel = useCallback(async (id: string) => {
    const desktopApi = window.transterm
    if (!desktopApi) throw new Error('桌面 API 不可用')
    await desktopApi.deleteTunnelProfile(id)
    setTunnels((previous) => previous.filter((tunnel) => tunnel.id !== id))
    setError(null)
  }, [])

  return {
    tunnels,
    loading,
    error,
    clearError: () => setError(null),
    reload,
    saveTunnel,
    deleteTunnel
  }
}
