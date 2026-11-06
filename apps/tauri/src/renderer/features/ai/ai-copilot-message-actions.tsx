import { t } from '../../i18n'
import { AppIcon } from '../common/app-icon'
import { AiCopilotCopyButton } from './ai-copilot-copy-button'
import { aiConversationText } from './ai-conversation-text'

export function AiCopilotMessageActions({
  text,
  deleteDisabled = false,
  onDelete,
  onEdit,
  onBranch
}: {
  text: string
  deleteDisabled?: boolean
  onDelete(): void
  onEdit?(): void
  onBranch?(): void
}) {
  return (
    <div aria-label={t.aiCopilotMessageActions} className="ai-copilot-message-actions" role="group">
      {onEdit ? (
        <button
          type="button"
          className="ai-copilot-message-edit-button"
          disabled={deleteDisabled}
          aria-label={aiConversationText().edit}
          title={aiConversationText().edit}
          onClick={onEdit}
        >
          <AppIcon name="ai-edit" size={13} />
        </button>
      ) : null}
      {onBranch ? (
        <button
          type="button"
          className="ai-copilot-message-branch-button"
          disabled={deleteDisabled}
          aria-label={aiConversationText().branch}
          title={aiConversationText().branch}
          onClick={onBranch}
        >
          <AppIcon name="ai-new-chat" size={13} />
        </button>
      ) : null}
      {text.trim() ? (
        <AiCopilotCopyButton
          className="ai-copilot-message-copy-button"
          copiedLabel={t.aiCopilotMessageCopied}
          label={t.aiCopilotCopyMessage}
          text={text}
        />
      ) : null}
      <button
        aria-label={t.aiCopilotDeleteMessage}
        className="ai-copilot-message-delete-button"
        disabled={deleteDisabled}
        title={t.aiCopilotDeleteMessage}
        type="button"
        onClick={onDelete}
      >
        <AppIcon name="ai-trash" size={13} />
      </button>
    </div>
  )
}
