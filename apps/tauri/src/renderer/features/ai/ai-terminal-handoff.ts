import type { AiToolActivity, WorkspaceTab } from '@transterm/core'
import { t } from '../../i18n'

export async function handoffAiCommand(
  activity: AiToolActivity,
  activeTab: WorkspaceTab | null,
  isConnected: boolean,
  execute: (requestId: string, tabId: string, command: string) => Promise<void>,
  onMessage: (message: string) => void
) {
  const { target, command, approvalRequestId } = activity.proposal
  if (
    !window.transterm ||
    activeTab?.id !== target.tabId ||
    activeTab.sessionType !== 'ssh' ||
    !isConnected ||
    /[\r\n]/.test(command)
  ) {
    onMessage(t.aiCopilotCommandWriteUnavailable)
    throw Error(t.aiCopilotCommandWriteUnavailable)
  }
  if (!approvalRequestId) {
    onMessage(t.aiCopilotTerminalInputWriteFailed)
    throw Error(t.aiCopilotTerminalInputWriteFailed)
  }
  try {
    await execute(approvalRequestId, target.tabId, command)
    onMessage(t.aiCopilotTerminalInputWritten)
  } catch (error) {
    onMessage(t.aiCopilotTerminalInputWriteFailed)
    throw error
  }
}
