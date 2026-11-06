import { useMemo, useState } from 'react'
import type { CreateProxyProfileInput, UpdateProxyProfileInput } from '@transterm/core'
import { useProxyLibrary } from '../../hooks/use-proxy-library'
import { useWindowReveal } from '../../hooks/use-window-reveal'
import { WorkspaceLoadingState } from '../common/workspace-loading-state'
import { ProxyEditDialog } from './proxy-edit-dialog'

export function ProxyFormHost({
  mode,
  proxyId,
  initialType = 'socks5',
  standalone = false,
  onClose
}: {
  mode: 'create' | 'edit'
  proxyId?: string | null
  initialType?: 'socks5' | 'http'
  standalone?: boolean
  onClose(): void
}) {
  const { proxies, loading, saveProxy, testProxy } = useProxyLibrary()
  const [isSubmitting, setIsSubmitting] = useState(false)
  useWindowReveal(standalone && Boolean(window.transterm) && (mode !== 'edit' || !loading))

  const editingProxy = useMemo(() => {
    if (mode !== 'edit' || !proxyId) return null
    return proxies.find((p) => p.id === proxyId) ?? null
  }, [mode, proxyId, proxies])

  const handleSave = async (input: CreateProxyProfileInput | UpdateProxyProfileInput) => {
    setIsSubmitting(true)
    try {
      await saveProxy(input)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (mode === 'edit' && proxyId && loading && !editingProxy) {
    return <WorkspaceLoadingState className="connection-form-window" />
  }

  return (
    <ProxyEditDialog
      initialProxy={editingProxy}
      initialType={initialType}
      isOpen={true}
      isSubmitting={isSubmitting}
      standalone={standalone}
      onClose={onClose}
      onSave={handleSave}
      onTest={testProxy}
    />
  )
}
