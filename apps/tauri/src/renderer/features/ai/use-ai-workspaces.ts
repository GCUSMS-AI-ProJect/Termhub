import { useEffect, useRef, useState } from 'react'
import type { AiWorkspace, SaveAiWorkspaceInput } from '@transterm/core'
import { toMessage } from './ai-copilot-utils'

export function useAiWorkspaces() {
  const [workspaces, setWorkspaces] = useState<AiWorkspace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  useEffect(() => {
    const api = window.transterm
    if (!api) return
    let live = true
    const refresh = () => {
      void api
        .listAiWorkspaces()
        .then((items) => {
          if (live) {
            setWorkspaces(items)
            setSelectedId((current) => (items.some((item) => item.id === current) ? current : null))
          }
        })
        .catch((error) => {
          if (live) setError(toMessage(error))
        })
    }
    refresh()
    window.addEventListener('transterm:ai-workspaces-changed', refresh)
    return () => {
      live = false
      window.removeEventListener('transterm:ai-workspaces-changed', refresh)
    }
  }, [])
  const save = async (input: SaveAiWorkspaceInput) => {
    const api = window.transterm
    if (!api || busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const workspace = await api.saveAiWorkspace(input)
      setWorkspaces((items) => [...items.filter((item) => item.id !== workspace.id), workspace])
      window.dispatchEvent(new Event('transterm:ai-workspaces-changed'))
      return workspace
    } catch (error) {
      setError(toMessage(error))
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const addLocal = async () => {
    const api = window.transterm
    if (!api || busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const path = await api.selectLocalDirectory()
      if (!path) return null
      const name =
        path
          .replace(/[\\/]+$/, '')
          .split(/[\\/]/)
          .pop() || path
      const workspace = await api.saveAiWorkspace({ name, kind: 'local', path })
      setWorkspaces((items) => [...items.filter((item) => item.id !== workspace.id), workspace])
      window.dispatchEvent(new Event('transterm:ai-workspaces-changed'))
      return workspace
    } catch (error) {
      setError(toMessage(error))
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    const api = window.transterm
    if (!api || busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await api.deleteAiWorkspace(id)
      setWorkspaces((items) => items.filter((item) => item.id !== id))
      if (selectedId === id) setSelectedId(null)
      window.dispatchEvent(new Event('transterm:ai-workspaces-changed'))
      return true
    } catch (error) {
      setError(toMessage(error))
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return {
    workspaces,
    selectedId,
    selected: workspaces.find((item) => item.id === selectedId) ?? null,
    select: setSelectedId,
    busy,
    error,
    save,
    addLocal,
    remove
  }
}
