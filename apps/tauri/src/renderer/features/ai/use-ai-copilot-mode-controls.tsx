import { useState } from 'react'
import type { AiCopilotMode, AiCopilotModeState } from '@transterm/core'
import { t } from '../../i18n'
import type { AppIconName } from '../common/app-icon'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'

export function copilotModeDescription(mode: AiCopilotMode) {
  return mode === 'pure-conversation'
    ? t.aiCopilotModePureDescription
    : mode === 'semi-automatic'
      ? t.aiCopilotModeSemiDescription
      : t.aiCopilotModeFullDescription
}
export function copilotModeIconName(mode: AiCopilotMode): AppIconName {
  return mode === 'pure-conversation' ? 'ai-message' : mode === 'semi-automatic' ? 'ai-shield' : 'ai-auto'
}
export function useAiCopilotModeControls({
  mode,
  modeState,
  isStreaming,
  sshBusy,
  setMode,
  setRestrictions
}: {
  mode: AiCopilotMode
  modeState: AiCopilotModeState | null
  isStreaming: boolean
  sshBusy(): boolean
  setMode(mode: AiCopilotMode, confirmed?: boolean): Promise<AiCopilotModeState | null>
  setRestrictions(enabled: boolean): Promise<AiCopilotModeState | null>
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const enabled = modeState?.autoModeGuardrails.dangerousCommandRestrictionsEnabled ?? true
  const selectCopilotMode = (next: AiCopilotMode) => {
    if (isStreaming || sshBusy() || next === mode) return
    if (next === 'fully-automatic') setConfirmOpen(true)
    else void setMode(next)
  }
  return {
    selectCopilotMode,
    dangerousCommandRestrictionsEnabled: enabled,
    toggleDangerousCommandRestrictions: () => {
      if (!isStreaming && modeState) void setRestrictions(!enabled)
    },
    confirmationDialog: confirmOpen ? (
      <ConfirmActionDialog
        confirmLabel={t.aiCopilotModeFullConfirm}
        confirmVariant="danger"
        description={t.aiCopilotModeFullWarning}
        isSubmitting={confirming}
        onClose={() => {
          if (!confirming) setConfirmOpen(false)
        }}
        onConfirm={() => {
          setConfirming(true)
          void setMode('fully-automatic', true)
            .then((next) => {
              if (next) setConfirmOpen(false)
            })
            .finally(() => setConfirming(false))
        }}
        title={t.aiCopilotModeFullTitle}
      />
    ) : null
  }
}
