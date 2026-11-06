import { AppIcon } from '../common/app-icon'
import type { RefObject } from 'react'
import type { AiConversation, AiMessage, AiToolActivity, ActionApprovalRequest } from '@transterm/core'
import { t } from '../../i18n'
import { AiMessageAttachments } from './ai-attachments'
import { VerticalScrollbar } from '../common/vertical-scrollbar'
import { AiCopilotMarkdown } from './ai-copilot-markdown'
import { AiCopilotMessageActions } from './ai-copilot-message-actions'
import { AiCopilotToolActivity } from './ai-copilot-tool-activity'
import { useAiMessageScroll } from './use-ai-message-scroll'
import './ai-conversation-content.css'

export function AiCopilotMessageList({
  canRetry,
  conversation,
  errorMessage,
  executeCommandInTerminal,
  isStreaming,
  messageViewportRef,
  onDeleteMessage,
  onRetryLastRequest,
  resolveToolApproval,
  resolvingToolApprovalIds,
  toolActivities,
  toolApprovalRequests,
  onEditMessage,
  onBranchMessage
}: {
  canRetry: boolean
  conversation: AiConversation | null
  errorMessage: string | null
  executeCommandInTerminal(activity: AiToolActivity): Promise<void>
  isStreaming: boolean
  messageViewportRef: RefObject<HTMLDivElement | null>
  onDeleteMessage(message: AiMessage): void
  onRetryLastRequest(): Promise<void>
  resolveToolApproval(requestId: string, approved: boolean, riskAcknowledged?: boolean): void
  resolvingToolApprovalIds: Set<string>
  toolActivities: AiToolActivity[]
  toolApprovalRequests: ActionApprovalRequest[]
  onEditMessage?(message: AiMessage): void
  onBranchMessage?(message: AiMessage): void
}) {
  const { contentRef, scrollToLatest, showScrollToLatest } = useAiMessageScroll(
    messageViewportRef,
    conversation?.id,
    conversation?.messages
  )
  const pendingApproval = toolApprovalRequests.some((request) =>
    toolActivities.some((activity) => !activity.result && activity.proposal.approvalRequestId === request.requestId)
  )
  const runningTool = toolActivities.some((activity) => !activity.result || activity.result.status === 'running')
  return (
    <div className="ai-copilot-message-scroll-region">
      <div
        ref={messageViewportRef}
        className="ai-copilot-message-viewport"
        role="log"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div ref={contentRef} className="ai-conversation-content">
          {!conversation?.messages.length ? (
            <section className="ai-copilot-empty-chat">
              <AppIcon name="ai-message" size={16} />
              <h2>{t.aiCopilotWelcomeTitle}</h2>
              <p>{t.aiCopilotWelcomeDescription}</p>
            </section>
          ) : (
            conversation.messages.map((message) => (
              <article
                key={message.id}
                className={`ai-copilot-message is-${message.role}`}
                aria-label={message.role === 'user' ? t.aiCopilotMessageUser : t.aiCopilotMessageAssistant}
              >
                <span className="ai-copilot-message-role">
                  {message.role === 'assistant' ? <AppIcon name="ai-assistant" size={15} /> : null}
                  {message.role === 'user' ? t.aiCopilotMessageUser : t.aiCopilotMessageAssistant}
                </span>
                {message.content && message.role === 'assistant' ? (
                  <AiCopilotMarkdown content={message.content} />
                ) : message.content ? (
                  <p className="ai-copilot-message-plain">{message.content}</p>
                ) : null}
                {message.attachments?.length ? (
                  <AiMessageAttachments attachments={message.attachments} conversationId={conversation.id} />
                ) : null}
                {message.toolActivities?.map((activity) => (
                  <AiCopilotToolActivity
                    key={activity.proposal.id}
                    activity={activity}
                    isRequestActive={isStreaming}
                    approval={
                      activity.proposal.approvalRequestId
                        ? toolApprovalRequests.find(
                            (request) => request.requestId === activity.proposal.approvalRequestId
                          )
                        : undefined
                    }
                    isResolvingApproval={Boolean(
                      activity.proposal.approvalRequestId &&
                      resolvingToolApprovalIds.has(activity.proposal.approvalRequestId)
                    )}
                    onResolveApproval={resolveToolApproval}
                    onExecuteTerminalCommand={executeCommandInTerminal}
                  />
                ))}
                <AiCopilotMessageActions
                  deleteDisabled={isStreaming}
                  text={message.content}
                  onEdit={message.role === 'user' && onEditMessage ? () => onEditMessage(message) : undefined}
                  onBranch={onBranchMessage ? () => onBranchMessage(message) : undefined}
                  onDelete={() => {
                    if (!isStreaming) onDeleteMessage(message)
                  }}
                />
              </article>
            ))
          )}
          {isStreaming ? (
            <div
              className={`ai-copilot-streaming-indicator${pendingApproval ? ' is-awaiting-approval' : ''}`}
              role="status"
              aria-live="polite"
            >
              <AppIcon name={pendingApproval ? 'ai-shield' : 'ai-loading'} size={16} />
              {pendingApproval
                ? t.aiCopilotToolApprovalPending
                : runningTool
                  ? t.aiCopilotToolPending
                  : t.aiCopilotThinking}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="ai-copilot-stream-error" role="alert">
              <span>{errorMessage}</span>
              {canRetry ? (
                <button disabled={isStreaming} type="button" onClick={() => void onRetryLastRequest()}>
                  <AppIcon name="ai-refresh" size={16} />
                  {t.aiCopilotRetry}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {showScrollToLatest ? (
        <button
          className="ai-conversation-scroll-latest"
          aria-label={t.aiCopilotScrollToLatest}
          title={t.aiCopilotScrollToLatest}
          type="button"
          onClick={scrollToLatest}
        >
          <AppIcon name="ai-send" size={16} />
          <span>{t.aiCopilotScrollToLatest}</span>
        </button>
      ) : null}
      <VerticalScrollbar ariaLabel={t.scrollContent} scrollRef={messageViewportRef} />
    </div>
  )
}
