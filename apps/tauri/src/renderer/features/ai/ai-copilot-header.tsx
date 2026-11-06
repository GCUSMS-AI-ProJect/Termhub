import { t } from '../../i18n'
import { CloseButton } from '../common/close-button'
import { AppIcon } from '../common/app-icon'

export function AiCopilotHeader({
  canChat,
  isStreaming,
  isHistoryOpen,
  onOpenHistory,
  onClose,
  onOpenSettings,
  openNewConversation
}: {
  canChat: boolean
  isStreaming: boolean
  isHistoryOpen: boolean
  onOpenHistory(): void
  onClose(): void
  onOpenSettings(): void
  openNewConversation(): void
}) {
  return (
    <header className="ai-copilot-header">
      <div className="ai-copilot-title">
        <AppIcon name="ai-assistant" size={20} />
        <span>
          <strong>{t.aiCopilot}</strong>
        </span>
      </div>
      <div className="ai-copilot-header-actions">
        <button
          aria-label={t.aiCopilotHistorySearch}
          aria-pressed={isHistoryOpen}
          className="ai-copilot-icon-button ai-copilot-history-toggle"
          disabled={!canChat || isStreaming}
          title={t.aiCopilotHistorySearch}
          type="button"
          onClick={onOpenHistory}
        >
          <AppIcon name="ai-message" size={16} />
        </button>
        <button
          aria-label={t.aiCopilotNewChat}
          className="ai-copilot-icon-button"
          disabled={!canChat || isStreaming}
          title={t.aiCopilotNewChat}
          type="button"
          onClick={openNewConversation}
        >
          <AppIcon name="ai-new-chat" size={16} />
        </button>
        <button
          aria-label={t.aiCopilotConfigureProvider}
          className="ai-copilot-icon-button"
          title={t.aiCopilotConfigureProvider}
          type="button"
          onClick={onOpenSettings}
        >
          <AppIcon name="ai-settings" size={16} />
        </button>
        <CloseButton iconName="ai-close" aria-label={t.closeAiCopilot} onClick={onClose} size="compact" />
      </div>
    </header>
  )
}
