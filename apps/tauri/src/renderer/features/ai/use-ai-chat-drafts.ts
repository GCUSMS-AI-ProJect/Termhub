import { useEffect, useRef, useState } from 'react'
import type { AiChatDraft } from '@transterm/core'
import type { useAiAttachments } from './use-ai-attachments'
import { LAST_AI_DRAFT, persistAiDraft, waitForAiDraftWrites } from './ai-draft-storage'

export function aiDraftScope(conversationId?: string | null, workspaceId?: string | null) {
  return conversationId ? `conversation-${conversationId}` : workspaceId ? `workspace-${workspaceId}` : 'new'
}

export function useAiChatDrafts({
  conversationId,
  workspaceId,
  providerId,
  providerIds,
  model,
  loading,
  uploads,
  loadConversation,
  selectWorkspace,
  selectProvider,
  selectModel
}: {
  conversationId?: string
  workspaceId: string | null
  providerId: string | null
  providerIds: string[]
  model: string | null
  loading: boolean
  uploads: ReturnType<typeof useAiAttachments>
  loadConversation(id: string): Promise<unknown>
  selectWorkspace(id: string | null): void
  selectProvider(id: string | null): void
  selectModel(model: string | null): void
}) {
  const [draft, setDraft] = useState('')
  const [restoring, setRestoring] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const switching = useRef(false)
  const latest = useRef<AiChatDraft | null>(null)
  const callbacks = useRef({ uploads, loadConversation, selectWorkspace, selectProvider, selectModel, providerIds })
  callbacks.current = { uploads, loadConversation, selectWorkspace, selectProvider, selectModel, providerIds }
  latest.current = {
    scope: aiDraftScope(conversationId, workspaceId),
    text: draft,
    attachments: uploads.attachments.map((file) => file.upload),
    conversationId,
    workspaceId: workspaceId ?? undefined,
    providerId: providerId ?? undefined,
    model: model ?? undefined
  }

  const persist = (snapshot: AiChatDraft | null, remember = true) => {
    if (!snapshot || !window.transterm) return Promise.resolve()
    return persistAiDraft(window.transterm, snapshot, remember).then(() => setError(null))
  }
  const restore = async (scope: string) => {
    const saved = await window.transterm?.getAiChatDraft(scope)
    setDraft(saved?.text ?? '')
    await callbacks.current.uploads.replaceUploads(saved?.attachments ?? [])
    if (saved?.providerId && callbacks.current.providerIds.includes(saved.providerId)) {
      callbacks.current.selectProvider(saved.providerId)
      if (saved.model) callbacks.current.selectModel(saved.model)
    }
  }
  useEffect(() => {
    if (loading || started.current) return
    started.current = true
    switching.current = true
    void (async () => {
      const api = window.transterm
      if (!api) return
      await waitForAiDraftWrites()
      const last = await api.getUiStateItem(LAST_AI_DRAFT)
      if (last) {
        const saved = JSON.parse(last) as { scope: string; conversationId?: string; workspaceId?: string }
        if (saved.conversationId && !(await callbacks.current.loadConversation(saved.conversationId))) {
          await restore(aiDraftScope(null, workspaceId))
          return
        } else callbacks.current.selectWorkspace(saved.workspaceId ?? null)
        await restore(saved.scope)
      }
    })()
      .catch((error) => setError(String(error)))
      .finally(() => {
        switching.current = false
        setRestoring(false)
      })
  }, [loading])
  useEffect(() => {
    if (restoring || switching.current) return
    const timer = window.setTimeout(() => void persist(latest.current).catch((error) => setError(String(error))), 700)
    return () => window.clearTimeout(timer)
  }, [draft, uploads.attachments, conversationId, workspaceId, providerId, model, restoring])
  useEffect(
    () => () => {
      if (started.current && !switching.current) void persist(latest.current).catch(() => undefined)
    },
    []
  )

  const navigate = async (
    action: () => Promise<unknown> | void,
    nextConversationId?: string | null,
    nextWorkspaceId?: string | null
  ) => {
    switching.current = true
    setRestoring(true)
    try {
      await persist(latest.current)
      await action()
      await restore(aiDraftScope(nextConversationId, nextWorkspaceId))
    } catch (error) {
      setError(String(error))
      throw error
    } finally {
      switching.current = false
      setRestoring(false)
    }
  }
  return {
    draft,
    setDraft,
    restoring,
    error,
    navigate,
    flush: () => (switching.current ? waitForAiDraftWrites() : persist(latest.current)),
    snapshot: () => latest.current,
    markSubmitted: (snapshot: AiChatDraft | null) =>
      snapshot ? persist({ ...snapshot, text: '', attachments: [] }, false) : Promise.resolve()
  }
}
