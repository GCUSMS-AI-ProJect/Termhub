import type { AiChatDraft } from '@transterm/core'

export const LAST_AI_DRAFT = 'ai.copilot.last-draft.v1'
// Shared across sidebar mounts so an outgoing save finishes before restoration.
let pendingWrites = Promise.resolve()
export function waitForAiDraftWrites() {
  return pendingWrites.catch(() => undefined)
}

export function persistAiDraft(
  api: {
    saveAiChatDraft(draft: AiChatDraft): Promise<void>
    setUiStateItem(key: string, value: string): Promise<void>
  },
  draft: AiChatDraft,
  remember = true
) {
  pendingWrites = pendingWrites
    .catch(() => undefined)
    .then(async () => {
      await api.saveAiChatDraft(draft)
      if (remember)
        await api.setUiStateItem(
          LAST_AI_DRAFT,
          JSON.stringify({ scope: draft.scope, conversationId: draft.conversationId, workspaceId: draft.workspaceId })
        )
    })
  return pendingWrites
}
