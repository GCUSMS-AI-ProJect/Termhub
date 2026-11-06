import { useState } from 'react'
import type { AiConversation, AiMessage } from '@transterm/core'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'
import { aiConversationText } from './ai-conversation-text'
import type { useAiAttachments } from './use-ai-attachments'
import type { SendMessageOptions } from './ai-copilot-utils'

export function useAiMessageBranches({
  conversation,
  disabled,
  loadConversation,
  setMode,
  setContextAttach,
  setDraft,
  uploads,
  navigate,
  onError,
  sendMessage
}: {
  conversation: AiConversation | null
  disabled: boolean
  loadConversation(id: string): Promise<unknown>
  setMode(): Promise<unknown>
  setContextAttach(): Promise<unknown>
  setDraft(value: string): void
  uploads: ReturnType<typeof useAiAttachments>
  navigate(
    action: () => Promise<unknown> | void,
    conversationId?: string | null,
    workspaceId?: string | null
  ): Promise<void>
  onError(message: string): void
  sendMessage(value: string, options: SendMessageOptions): Promise<boolean>
}) {
  const [editing, setEditing] = useState<AiMessage | null>(null)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const text = aiConversationText()
  const branch = async (message: AiMessage, edit: boolean) => {
    const api = window.transterm
    if (!api || !conversation || disabled || busy) return
    setBusy(true)
    setError(null)
    try {
      const attachments = edit ? await api.getAiMessageAttachments(conversation.id, message.id) : []
      const next = await api.forkAiConversation({
        conversationId: conversation.id,
        messageId: message.id,
        beforeMessage: edit
      })
      await setMode()
      await setContextAttach()
      await navigate(
        async () => {
          const loaded = await loadConversation(next.id)
          if (!loaded) throw Error(text.loadFailed)
        },
        next.id,
        next.workspaceId
      )
      if (edit) {
        setDraft(content)
        await uploads.replaceUploads(attachments)
        const sent = await sendMessage(content, { attachments, mode: 'pure-conversation' })
        if (sent) {
          setDraft('')
          uploads.clear()
        }
      }
      setEditing(null)
      onError(text.branchCreated)
    } catch (error) {
      setError(String(error))
      onError(String(error))
    } finally {
      setBusy(false)
    }
  }
  return {
    onEdit: (message: AiMessage) => {
      setEditing(message)
      setContent(message.content)
      setError(null)
    },
    onBranch: (message: AiMessage) => void branch(message, false),
    dialog: editing ? (
      <ConfirmActionDialog
        title={text.editTitle}
        confirmVariant="primary"
        confirmLabel={text.edit}
        confirmDisabled={!content.trim()}
        isSubmitting={busy}
        errorMessage={error}
        onClose={() => setEditing(null)}
        onConfirm={() => void branch(editing, true)}
        description={
          <>
            <p>{text.editHint}</p>
            <textarea
              className="ai-edit-message"
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </>
        }
      />
    ) : null
  }
}
