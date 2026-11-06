import { useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from 'react'
import type { AiCopilotMode, AiProviderSummary, AiReasoningEffort } from '@transterm/core'
import { t } from '../../i18n'
import { AppIcon, type AppIconName } from '../common/app-icon'
import { DropdownSelect } from '../common/dropdown-select'
import { Tooltip } from '../../components/common/tooltip/tooltip'
import { AiModelPicker } from './ai-model-picker'
import { getAiReasoningOptions } from './ai-reasoning'
import { AiAttachmentButton, AiPendingAttachments } from './ai-attachments'
import { aiConversationText } from './ai-conversation-text'

function reasoningEffortLabel(effort: AiReasoningEffort) {
  return effort
}

export function AiCopilotComposer({
  canChat,
  copilotMode,
  copilotModeDescription,
  copilotModeIconName,
  currentProvider,
  draft,
  isContextPreviewing,
  isStreaming,
  isSshConnecting,
  attachments,
  isReadingAttachments,
  attachmentError,
  onAttachFiles,
  onRemoveAttachment,
  isTerminalTarget,
  onComposerKeyDown,
  providers,
  referenceTerminal,
  reaControl,
  sshControl,
  reasoningEffort,
  requiresTerminalContext,
  selectCopilotMode,
  selectModel,
  selectProvider,
  selectReasoningEffort,
  selectedModel,
  selectedProviderId,
  send,
  setDraft,
  stop,
  toggleTerminalReference,
  composerCompositionRef,
  onReferenceFile,
  isRestoringDraft = false
}: {
  canChat: boolean
  copilotMode: AiCopilotMode
  copilotModeDescription(mode: AiCopilotMode): string
  copilotModeIconName(mode: AiCopilotMode): AppIconName
  currentProvider: AiProviderSummary | null
  draft: string
  isContextPreviewing: boolean
  isStreaming: boolean
  isSshConnecting: boolean
  attachments: import('./ai-attachment-utils').PendingAiAttachment[]
  isReadingAttachments: boolean
  attachmentError: string | null
  onAttachFiles(files: File[]): void
  onRemoveAttachment(id: string): void
  isTerminalTarget: boolean
  onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void
  providers: AiProviderSummary[]
  referenceTerminal: boolean
  reaControl: ReactNode
  sshControl: ReactNode
  reasoningEffort: AiReasoningEffort
  requiresTerminalContext: boolean
  selectCopilotMode(nextMode: AiCopilotMode): void
  selectModel(model: string | null): void
  selectProvider(providerId: string | null): void
  selectReasoningEffort(effort: AiReasoningEffort): void
  selectedModel: string | null
  selectedProviderId: string | null
  send(): Promise<void>
  setDraft(value: string): void
  stop(): Promise<void>
  toggleTerminalReference(): void
  composerCompositionRef: MutableRefObject<boolean>
  onReferenceFile(): void
  isRestoringDraft?: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isPreparing = isContextPreviewing || isRestoringDraft
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const resize = () => {
      textarea.style.height = '0px'
      textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 74), 180) + 'px'
    }
    resize()
    const observer = new ResizeObserver(() => {
      // Only width changes affect wrapping; own height changes are ignored.
      if (textarea.clientWidth !== width) {
        width = textarea.clientWidth
        resize()
      }
    })
    let width = textarea.clientWidth
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [draft])
  const contextHint =
    copilotMode !== 'pure-conversation'
      ? t.aiCopilotContextLockedByMode
      : referenceTerminal
        ? isTerminalTarget
          ? t.aiCopilotContextAutoHint
          : t.aiCopilotContextNeedsTerminal
        : t.aiCopilotL0ComposerHint
  const reasoningModel = selectedModel || currentProvider?.model || ''
  const reasoningOptions: AiReasoningEffort[] = currentProvider
    ? getAiReasoningOptions(currentProvider, reasoningModel)
    : []
  const visibleReasoningEffort = reasoningOptions.includes(reasoningEffort)
    ? reasoningEffort
    : (reasoningOptions[0] ?? '')

  return (
    <footer className="ai-copilot-composer-area">
      <div className="ai-copilot-composer-zone">
        {canChat ? (
          <section className="ai-copilot-context-dock" aria-label={t.aiCopilotReferenceTerminal}>
            <div className="ai-copilot-context-dock-row">
              <Tooltip label={t.aiCopilotReferenceTerminal} description={contextHint}>
                <button
                  aria-pressed={referenceTerminal}
                  aria-label={t.aiCopilotReferenceTerminal}
                  aria-busy={isContextPreviewing}
                  className={`ai-copilot-context-switch ${referenceTerminal ? 'is-active' : ''}`}
                  disabled={
                    isStreaming ||
                    isSshConnecting ||
                    isPreparing ||
                    copilotMode !== 'pure-conversation' ||
                    (!isTerminalTarget && !referenceTerminal)
                  }
                  type="button"
                  onClick={toggleTerminalReference}
                >
                  <span aria-hidden="true" className="stable-button-icon ai-copilot-context-switch-icon">
                    {isContextPreviewing ? (
                      <span className="button-spinner" />
                    ) : (
                      <AppIcon name={referenceTerminal ? 'ai-eye' : 'ai-eye-off'} size={16} />
                    )}
                  </span>
                  <span>{t.aiCopilotReferenceTerminal}</span>
                  <span className="ai-copilot-context-switch-state">
                    {referenceTerminal ? t.aiCopilotReferenceTerminalOn : t.aiCopilotReferenceTerminalOff}
                  </span>
                </button>
              </Tooltip>
              <span className="ai-copilot-context-caption">{contextHint}</span>
            </div>
          </section>
        ) : null}
        <div className={`ai-copilot-composer ${!canChat ? 'is-disabled' : ''}`}>
          {attachments.length ? (
            <AiPendingAttachments
              attachments={attachments}
              disabled={isStreaming || isReadingAttachments || isContextPreviewing}
              onRemove={onRemoveAttachment}
            />
          ) : null}
          {attachmentError ? (
            <p className="ai-attachment-error" role="alert">
              {attachmentError}
            </p>
          ) : null}
          <textarea
            ref={textareaRef}
            aria-label={t.aiCopilotInputAria}
            disabled={!canChat || isRestoringDraft}
            placeholder={
              !canChat
                ? t.aiCopilotComposerLocked
                : isStreaming
                  ? t.aiCopilotDraftWhileWorking
                  : copilotMode === 'pure-conversation'
                    ? t.aiCopilotPromptPlaceholder
                    : aiConversationText().taskPrompt
            }
            rows={3}
            value={draft}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
              if (files.length) {
                event.preventDefault()
                onAttachFiles(files)
              }
            }}
            onChange={(event) => setDraft(event.target.value)}
            onCompositionEnd={() => {
              // Keep the guard active through the IME commit keydown.
              window.setTimeout(() => {
                composerCompositionRef.current = false
              }, 0)
            }}
            onCompositionStart={() => {
              composerCompositionRef.current = true
            }}
            onKeyDown={onComposerKeyDown}
          />
          <div className="ai-copilot-composer-toolbar" title={t.aiCopilotComposerKeys}>
            <div className="ai-copilot-composer-toolbar-actions">
              <AiAttachmentButton
                disabled={!canChat || isStreaming || isReadingAttachments || isSshConnecting || isPreparing}
                onFiles={onAttachFiles}
              />
              <Tooltip label={aiConversationText().reference} description="@">
                <button
                  className="ai-context-file-button"
                  type="button"
                  disabled={!canChat || isStreaming || isSshConnecting || isReadingAttachments || isPreparing}
                  aria-label={aiConversationText().reference}
                  onClick={onReferenceFile}
                >
                  <AppIcon name="ai-code" size={18} />
                </button>
              </Tooltip>
              {canChat ? (
                <div className="ai-copilot-composer-models" aria-label={t.aiCopilotConversationControls}>
                  <AiModelPicker
                    providers={providers}
                    providerId={selectedProviderId}
                    model={selectedModel || currentProvider?.model || ''}
                    disabled={isStreaming || isSshConnecting || isPreparing}
                    onSelect={(providerId, model) => {
                      if (providerId !== selectedProviderId) selectProvider(providerId)
                      selectModel(model)
                    }}
                  />
                  {currentProvider ? (
                    <>
                      {reasoningOptions.length > 0 ? (
                        <>
                          <span aria-hidden="true" className="ai-copilot-composer-model-divider" />
                          <DropdownSelect
                            ariaLabel={t.aiCopilotReasoningEffortLabel}
                            className="ai-copilot-composer-select ai-copilot-reasoning-select"
                            disabled={isStreaming || isSshConnecting || isPreparing || reasoningOptions.length <= 1}
                            forceCustomMenu
                            menuClassName="ai-copilot-toolbar-menu"
                            menuPlacement="above"
                            menuWidth="auto"
                            options={reasoningOptions.map((effort) => ({
                              value: effort,
                              label: reasoningEffortLabel(effort)
                            }))}
                            value={visibleReasoningEffort}
                            onChange={(value) => selectReasoningEffort(value as AiReasoningEffort)}
                          />
                        </>
                      ) : null}
                      <span aria-hidden="true" className="ai-copilot-composer-model-divider ai-copilot-mode-divider" />
                      <DropdownSelect
                        ariaLabel={t.aiCopilotModeLabel}
                        className="ai-copilot-composer-select ai-copilot-mode-select"
                        disabled={isStreaming || isSshConnecting || isPreparing}
                        forceCustomMenu
                        menuClassName="ai-copilot-mode-menu"
                        menuPlacement="above"
                        menuWidth="auto"
                        options={[
                          { value: 'pure-conversation', label: t.aiCopilotModePure },
                          { value: 'semi-automatic', label: t.aiCopilotModeSemi },
                          { value: 'fully-automatic', label: t.aiCopilotModeFull }
                        ]}
                        renderOption={(option, selected) => {
                          const optionMode = option.value as AiCopilotMode
                          return (
                            <span className="ai-copilot-mode-option">
                              <span className="ai-copilot-mode-option-copy">
                                <strong>
                                  <AppIcon
                                    className="ai-copilot-mode-option-icon"
                                    name={copilotModeIconName(optionMode)}
                                    size={15}
                                  />
                                  <span>{option.label}</span>
                                  {selected ? (
                                    <AppIcon className="ai-copilot-mode-option-check" name="ai-check" size={13} />
                                  ) : null}
                                </strong>
                                <small>{copilotModeDescription(optionMode)}</small>
                              </span>
                            </span>
                          )
                        }}
                        renderValue={(option) => {
                          const optionMode = option.value as AiCopilotMode
                          return (
                            <span className="ai-copilot-mode-value">
                              <AppIcon
                                className="ai-copilot-mode-value-icon"
                                name={copilotModeIconName(optionMode)}
                                size={13}
                              />
                              <span>{option.label}</span>
                            </span>
                          )
                        }}
                        value={copilotMode}
                        onChange={(value) => selectCopilotMode(value as AiCopilotMode)}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
              {sshControl}
              {reaControl}
              {isStreaming ? (
                <button
                  aria-label={t.aiCopilotStop}
                  className="ai-copilot-composer-send is-stop"
                  type="button"
                  onClick={() => void stop()}
                >
                  <AppIcon name="ai-stop" size={16} />
                </button>
              ) : (
                <button
                  aria-label={t.aiCopilotSend}
                  title={t.aiCopilotComposerKeys}
                  className="ai-copilot-composer-send"
                  disabled={
                    !canChat ||
                    isSshConnecting ||
                    isPreparing ||
                    isReadingAttachments ||
                    (!draft.trim() && !attachments.length) ||
                    (requiresTerminalContext && (!referenceTerminal || !isTerminalTarget))
                  }
                  type="button"
                  onClick={() => void send()}
                >
                  <AppIcon name="ai-send" size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
