import { useCallback, useEffect, useRef, useState } from 'react'
import type { RemoteFileItem } from '@transterm/core'
import { remoteDirectories, remoteDirectoryAncestors } from './remote-directory-tree-model'

export function useRemoteDirectoryTree(tabId: string, currentPath: string, files: RemoteFileItem[], refresh: number) {
  const [cache, setCache] = useState<Record<string, RemoteFileItem[]>>({ [currentPath]: remoteDirectories(files) })
  const cacheRef = useRef(cache)
  const [expanded, setExpanded] = useState(new Set(remoteDirectoryAncestors(currentPath)))
  const [loading, setLoading] = useState(new Set<string>())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = useRef(new Map<string, Promise<void>>())
  const epoch = useRef(0)
  const currentPathRef = useRef(currentPath)
  currentPathRef.current = currentPath
  const lastRefresh = useRef(refresh)

  useEffect(
    () => () => {
      epoch.current += 1
      pending.current.clear()
    },
    []
  )

  const load = useCallback(
    (path: string, force = false): Promise<void> => {
      if (pending.current.has(path)) return pending.current.get(path)!
      if (!force && Object.hasOwn(cacheRef.current, path)) return Promise.resolve()
      const requestEpoch = epoch.current
      setLoading((previous) => new Set([...previous, path]))
      setErrors((previous) => {
        const next = { ...previous }
        delete next[path]
        return next
      })
      const request = Promise.resolve().then(async () => {
        try {
          const items = await window.transterm!.listRemoteDirectory(tabId, path)
          if (epoch.current !== requestEpoch || (!force && currentPathRef.current === path)) return
          cacheRef.current = { ...cacheRef.current, [path]: remoteDirectories(items) }
          setCache(cacheRef.current)
        } catch (error) {
          if (epoch.current === requestEpoch) setErrors((previous) => ({ ...previous, [path]: String(error) }))
        } finally {
          if (epoch.current === requestEpoch) {
            pending.current.delete(path)
            setLoading((previous) => {
              const next = new Set(previous)
              next.delete(path)
              return next
            })
          }
        }
      })
      pending.current.set(path, request)
      return request
    },
    [tabId]
  )

  useEffect(() => {
    cacheRef.current = { ...cacheRef.current, [currentPath]: remoteDirectories(files) }
    setCache(cacheRef.current)
    setErrors((previous) => {
      const next = { ...previous }
      delete next[currentPath]
      return next
    })
  }, [currentPath, files])

  useEffect(() => {
    const chain = remoteDirectoryAncestors(currentPath)
    setExpanded((previous) => new Set([...previous, ...chain]))
    const requestEpoch = epoch.current
    void (async () => {
      for (const path of chain.slice(0, -1)) {
        if (requestEpoch !== epoch.current) return
        await load(path)
      }
    })()
  }, [currentPath, load])

  useEffect(() => {
    if (lastRefresh.current === refresh) return
    lastRefresh.current = refresh
    epoch.current += 1
    pending.current.clear()
    cacheRef.current = { [currentPath]: remoteDirectories(files) }
    setCache(cacheRef.current)
    setLoading(new Set())
    setErrors({})
    const requestEpoch = epoch.current
    void (async () => {
      for (const path of expanded) {
        if (requestEpoch !== epoch.current) return
        await load(path)
      }
    })()
  }, [currentPath, expanded, files, load, refresh])

  const toggle = (path: string, open = !expanded.has(path)) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (open) next.add(path)
      else next.delete(path)
      return next
    })
    if (open) void load(path)
  }
  return { cache, expanded, loading, errors, load, toggle }
}
