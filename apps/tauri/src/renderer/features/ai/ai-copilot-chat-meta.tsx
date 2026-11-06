import { AppIcon } from '../common/app-icon'
import type { AiConversation } from '@transterm/core'
import { t } from '../../i18n'

export function AiCopilotChatMeta({
  commandActionMessage,
  conversation,
  conversationTitleDraft,
  deleteCurrentConversation,
  isDeleteConfirmationOpen,
  isRenamingConversation,
  isStreaming,
  onOpenConversationList,
  saveConversationTitle,
  setConversationTitleDraft,
  setIsDeleteConfirmationOpen,
  setIsRenamingConversation
}: {
  commandActionMessage: string | null
  conversation: AiConversation | null
  conversationTitleDraft: string
  deleteCurrentConversation(): Promise<void>
  isDeleteConfirmationOpen: boolean
  isRenamingConversation: boolean
  isStreaming: boolean
  onOpenConversationList(): void
  saveConversationTitle(): Promise<void>
  setConversationTitleDraft(value: string): void
  setIsDeleteConfirmationOpen(value: boolean): void
  setIsRenamingConversation(value: boolean): void
}) {
  return (
    <div className="ai-copilot-chat-meta">
      <div className="ai-copilot-conversation-page-header">
        <div className="ai-copilot-conversation-page-heading">
          <button
            aria-label={t.aiCopilotConversationBack}
            className="ai-copilot-conversation-back"
            disabled={isStreaming}
            title={t.aiCopilotConversationBack}
            type="button"
            onClick={onOpenConversationList}
          >
            <AppIcon name="ai-back" size={16} />
          </button>
          <div className="ai-copilot-conversation-page-title">
            <strong title={conversation?.title ?? t.aiCopilotNewChat}>
              {conversation?.title ?? t.aiCopilotNewChat}
            </strong>
          </div>
        </div>
        <section className="ai-copilot-conversation-actions" aria-label={t.aiCopilotConversationControls}>
          {conversation ? (
            isRenamingConversation ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveConversationTitle()
                }}
              >
                <input
                  aria-label={t.aiCopilotConversationTitle}
                  autoFocus
                  disabled={isStreaming}
                  maxLength={120}
                  value={conversationTitleDraft}
                  onChange={(event) => setConversationTitleDraft(event.target.value)}
                />
                <button disabled={isStreaming || !conversationTitleDraft.trim()} title={t.save} type="submit">
                  <AppIcon name="ai-check" size={16} />
                  {t.save}
                </button>
                <button
                  disabled={isStreaming}
                  title={t.cancel}
                  type="button"
                  onClick={() => {
                    setIsRenamingConversation(false)
                    setConversationTitleDraft(conversation.title)
                  }}
                >
                  <AppIcon name="ai-close" size={16} />
                  {t.cancel}
                </button>
              </form>
            ) : isDeleteConfirmationOpen ? (
              <div className="ai-copilot-conversation-delete-confirm">
                <span>{t.aiCopilotDeleteConversationConfirm}</span>
                <button
                  className="is-danger"
                  disabled={isStreaming}
                  type="button"
                  onClick={() => void deleteCurrentConversation()}
                >
                  {t.delete}
                </button>
                <button disabled={isStreaming} type="button" onClick={() => setIsDeleteConfirmationOpen(false)}>
                  {t.cancel}
                </button>
              </div>
            ) : (
              <div>
                <button
                  aria-label={t.rename}
                  disabled={isStreaming}
                  title={t.rename}
                  type="button"
                  onClick={() => {
                    setConversationTitleDraft(conversation.title)
                    setIsRenamingConversation(true)
                  }}
                >
                  <AppIcon name="ai-edit" size={16} />
                </button>
                <button
                  aria-label={t.aiCopilotDeleteConversation}
                  className="is-danger"
                  disabled={isStreaming}
                  title={t.aiCopilotDeleteConversation}
                  type="button"
                  onClick={() => setIsDeleteConfirmationOpen(true)}
                >
                  <AppIcon name="ai-trash" size={16} />
                </button>
              </div>
            )
          ) : null}
        </section>
      </div>
      {commandActionMessage ? (
        <div className="ai-copilot-command-feedback" role="status" aria-live="polite">
          {commandActionMessage}
        </div>
      ) : null}
    </div>
  )
}
