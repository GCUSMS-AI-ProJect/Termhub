import { useId, useRef, useState } from 'react'
import type { AiCommandRisk, AiToolActivity, ActionApprovalRequest } from '@transterm/core'
import { t } from '../../i18n'
import { AppIcon } from '../common/app-icon'
import { StableButtonContent } from '../common/stable-button-content'
import { SelectionControl } from '../common/selection-control'
import { VerticalScrollbar } from '../common/vertical-scrollbar'
import { AiCopilotCopyButton } from './ai-copilot-copy-button'
import { aiConversationText } from './ai-conversation-text'
import { AiFileChangePreview } from './ai-file-change-preview'

function commandRiskLabel(risk: AiCommandRisk) {
  switch (risk) {
    case 'read-only':
      return t.aiCopilotRiskReadOnly
    case 'mutating':
      return t.aiCopilotRiskMutating
    case 'destructive':
      return t.aiCopilotRiskDestructive
    case 'privileged':
      return t.aiCopilotRiskPrivileged
    default:
      return t.aiCopilotRiskUnknown
  }
}

export function AiCopilotToolActivity({
  activity,
  approval,
  isResolvingApproval = false,
  onResolveApproval,
  onExecuteTerminalCommand,
  isRequestActive = true
}: {
  activity: AiToolActivity
  approval?: ActionApprovalRequest
  isResolvingApproval?: boolean
  onResolveApproval?: (requestId: string, approved: boolean, riskAcknowledged?: boolean) => void
  onExecuteTerminalCommand?: (activity: AiToolActivity) => Promise<void>
  isRequestActive?: boolean
}) {
  const outputScrollRef = useRef<HTMLPreElement>(null)
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)
  const [isExecutingTerminalCommand, setIsExecutingTerminalCommand] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const detailsId = useId()
  const result = activity.result
  const status = result?.status ?? 'pending'
  const needsApproval = Boolean(approval && !result)
  const needsAttention = Boolean(
    result && !['running', 'executed', 'executed-in-terminal', 'cancelled', 'approved'].includes(status)
  )
  const alwaysExpanded = needsApproval || needsAttention || (status === 'running' && isRequestActive)
  const showDetails = alwaysExpanded || isExpanded
  const statusIcon =
    (status === 'running' || status === 'pending') && !isRequestActive
      ? 'ai-stop'
      : needsApproval
        ? 'ai-shield'
        : needsAttention
          ? 'ai-info'
          : !result || status === 'running'
            ? 'ai-loading'
            : status === 'cancelled'
              ? 'ai-stop'
              : 'ai-check'
  // Only a semi-automatic proposal has a live approval gate that can be
  // delegated to the visible terminal. Fully automatic calls are already
  // running through the isolated route; exposing this button while their
  // result is pending would execute the same command a second time.
  const canDelegateToTerminal = Boolean(
    activity.proposal.toolName === 'transterm_execute_remote_command' &&
    activity.proposal.target.sessionType === 'ssh' &&
    !activity.proposal.workingDirectory &&
    approval &&
    activity.proposal.approvalRequestId &&
    onExecuteTerminalCommand
  )
  const canExecuteTerminalCommand = Boolean(
    canDelegateToTerminal && !/[\r\n]/.test(activity.proposal.command) && !isExecutingTerminalCommand
  )
  const executeTerminalCommandButton =
    canDelegateToTerminal && onExecuteTerminalCommand && !result ? (
      <button
        aria-label={t.aiCopilotWriteTerminalInput}
        aria-busy={isExecutingTerminalCommand}
        className="ai-copilot-tool-write-button"
        disabled={!canExecuteTerminalCommand || isResolvingApproval}
        title={canExecuteTerminalCommand ? t.aiCopilotWriteTerminalInputHint : t.aiCopilotMultilinePasteUnavailable}
        type="button"
        onClick={() => {
          if (!onExecuteTerminalCommand || !canExecuteTerminalCommand) return
          setIsExecutingTerminalCommand(true)
          void onExecuteTerminalCommand(activity)
            .catch(() => undefined)
            .finally(() => setIsExecutingTerminalCommand(false))
        }}
      >
        <StableButtonContent
          busy={isExecutingTerminalCommand}
          icon={<AppIcon name="ai-terminal" size={13} />}
          label={t.aiCopilotWriteTerminalInput}
        />
      </button>
    ) : null
  const statusLabel = result
    ? status === 'running'
      ? isRequestActive
        ? t.aiCopilotToolPending
        : aiConversationText().interrupted
      : status === 'approved'
        ? t.aiCopilotToolApproved
        : status === 'executed'
          ? t.aiCopilotToolExecuted
          : status === 'input-required'
            ? t.aiCopilotToolWaitingForInput
            : status === 'executed-in-terminal'
              ? t.aiCopilotToolExecutedInTerminal
              : status === 'cancelled'
                ? t.aiCopilotToolCancelled
                : status === 'rejected' || status === 'auto-blocked'
                  ? t.aiCopilotToolRejected
                  : t.aiCopilotToolFailed
    : approval
      ? t.aiCopilotToolApprovalPending
      : isRequestActive
        ? t.aiCopilotToolPending
        : aiConversationText().interrupted
  const summaryContent = (
    <>
      <AppIcon name={statusIcon} size={15} />
      <span className="ai-conversation-step-label">
        <strong>{activity.proposal.toolName === 'transterm_rea' ? `REA · ${statusLabel}` : statusLabel}</strong>
        <code title={activity.proposal.command}>{activity.proposal.command}</code>
      </span>
    </>
  )
  return (
    <section
      className={`ai-copilot-command-card ai-copilot-tool-activity ai-conversation-step is-${status}${isRequestActive ? ' is-active-request' : ''}${needsApproval ? ' needs-approval' : ''}${needsAttention ? ' needs-attention' : ''}`}
    >
      <header className="ai-conversation-step-header">
        {alwaysExpanded ? (
          <div className="ai-conversation-step-summary">{summaryContent}</div>
        ) : (
          <button
            className="ai-conversation-step-summary"
            aria-controls={detailsId}
            aria-expanded={showDetails}
            type="button"
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {summaryContent}
            <AppIcon className="ai-conversation-step-chevron" name="ai-chevron-right" size={14} />
          </button>
        )}
        <span className={`ai-copilot-command-risk is-${activity.proposal.risk}`}>
          {commandRiskLabel(activity.proposal.risk)}
        </span>
      </header>
      <div id={detailsId} className="ai-conversation-step-details" hidden={!showDetails}>
        {status === 'running' && result?.durationMs !== undefined ? (
          <small>{Math.floor(result.durationMs / 1000)} s</small>
        ) : null}
        <div className="ai-copilot-code-block ai-copilot-command-code-block">
          <code>{activity.proposal.command}</code>
          <AiCopilotCopyButton text={activity.proposal.command} />
        </div>
        {activity.proposal.workingDirectory ? <p>{activity.proposal.workingDirectory}</p> : null}
        {activity.proposal.explanation ? <p>{activity.proposal.explanation}</p> : null}
        <AiFileChangePreview change={activity.proposal.fileChange} changeId={result?.fileChangeId} />
        {result?.reason && status !== 'executed-in-terminal' ? (
          <p className="is-warning">{result.reason}</p>
        ) : status === 'executed-in-terminal' ? (
          <p>{t.aiCopilotToolExecutedInTerminalDescription}</p>
        ) : null}
        {result?.stdout || result?.stderr ? (
          <div className="ai-copilot-tool-output-wrap">
            <pre ref={outputScrollRef} className="ai-copilot-tool-output">
              {[result.stdout, result.stderr].filter(Boolean).join('\n')}
            </pre>
            <VerticalScrollbar ariaLabel={t.aiCopilotToolActivity} scrollRef={outputScrollRef} />
          </div>
        ) : null}
        {approval && !result ? (
          <div className="ai-copilot-tool-approval">
            {approval.target ? <small>{`${t.aiCopilotToolApprovalTarget}：${approval.target}`}</small> : null}
            {approval.requiresRiskAcknowledgement ? (
              <label className="ai-copilot-tool-risk-ack">
                <SelectionControl
                  checked={riskAcknowledged}
                  disabled={isResolvingApproval || isExecutingTerminalCommand}
                  type="checkbox"
                  onChange={(event) => setRiskAcknowledged(event.currentTarget.checked)}
                />
                <span>{t.aiCopilotToolApprovalRisk}</span>
              </label>
            ) : null}
            <footer className="ai-copilot-tool-approval-actions">
              <button
                aria-busy={isResolvingApproval}
                disabled={isResolvingApproval || isExecutingTerminalCommand}
                type="button"
                onClick={() => onResolveApproval?.(approval.requestId, false)}
              >
                <StableButtonContent
                  busy={isResolvingApproval}
                  icon={<AppIcon name="ai-close" size={13} />}
                  label={t.aiCopilotToolReject}
                />
              </button>
              {executeTerminalCommandButton}
              <button
                aria-busy={isResolvingApproval}
                disabled={
                  isResolvingApproval ||
                  isExecutingTerminalCommand ||
                  (approval.requiresRiskAcknowledgement && !riskAcknowledged) ||
                  !onResolveApproval
                }
                type="button"
                onClick={() => onResolveApproval?.(approval.requestId, true, riskAcknowledged)}
              >
                <StableButtonContent
                  busy={isResolvingApproval}
                  icon={<AppIcon name="ai-check" size={13} />}
                  label={t.aiCopilotToolApprove}
                />
              </button>
            </footer>
          </div>
        ) : executeTerminalCommandButton ? (
          <footer className="ai-copilot-tool-result-actions">{executeTerminalCommandButton}</footer>
        ) : null}
      </div>
    </section>
  )
}
