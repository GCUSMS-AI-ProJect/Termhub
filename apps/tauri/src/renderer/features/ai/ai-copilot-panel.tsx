import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type {
  AiCopilotMode,
  AiWorkspace,
  AiConversationSummary,
  AiMessage,
  AiToolActivity,
  SessionSnapshot,
  WorkspaceTab
} from '@transterm/core'
import { t } from '../../i18n'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'
import { useAiCopilot } from './use-ai-copilot'
import { AiCopilotChatMeta } from './ai-copilot-chat-meta'
import { AiCopilotComposer } from './ai-copilot-composer'
import { AiCopilotConversationList } from './ai-copilot-conversation-list'
import { AiCopilotDangerousDock } from './ai-copilot-dangerous-dock'
import { AiCopilotHeader } from './ai-copilot-header'
import { AiCopilotMessageList } from './ai-copilot-message-list'
import { AiCopilotSetup } from './ai-copilot-setup'
import { AiReaControl } from './ai-rea-control'
import { AiSshControl } from './ai-ssh-control'
import { connectAiToCurrentSsh, type AiSshBinding } from './ai-ssh-connection'
import { formatMessage } from '../../i18n'
import { useAiAttachments } from './use-ai-attachments'
import { useAiWorkspaces } from './use-ai-workspaces'
import { AiWorkspaceControls } from './ai-workspace-controls'
import { Button } from '../../components/common/button/button'
import { AppIcon } from '../common/app-icon'
import './ai-workspace-controls.css'
import { useAiWorkspaceActions } from './use-ai-workspace-actions'
import { useAiFileDrop } from './use-ai-file-drop'
import { useAiChatDrafts } from './use-ai-chat-drafts'
import { useAiHistorySearch } from './use-ai-history-search'
import { useAiMessageBranches } from './use-ai-message-branches'
import { useAiContextFiles } from './use-ai-context-files'
import { AiTaskSummary } from './ai-task-summary'
import { handoffAiCommand } from './ai-terminal-handoff'
import { useAiPanelSelection } from './use-ai-panel-selection'
import { aiConversationText } from './ai-conversation-text'
import { useAiCopilotModeControls, copilotModeDescription, copilotModeIconName } from './use-ai-copilot-mode-controls'

const COMMAND_FEEDBACK_DISMISS_MS = 4_000

export function AiCopilotPanel({
  activeSession,
  activeTab,
  rootTab,
  isResizing,
  onClose,
  onOpenSettings,
  onResizeStart,
  onConnectWorkspace
}: {
  activeSession: SessionSnapshot | null
  activeTab: WorkspaceTab | null
  rootTab: WorkspaceTab | null
  isResizing?: boolean
  onClose(): void
  onOpenSettings(): void
  onResizeStart?: () => void
  onConnectWorkspace(workspace: AiWorkspace): Promise<void>
}) {
  const isTerminalTarget =
    (activeTab?.sessionType === 'ssh' || activeTab?.sessionType === 'local') && activeSession?.connected === true
  const [panelHost, setPanelHost] = useState<Element | null>(null)
  useLayoutEffect(() => {
    setPanelHost(document.querySelector('.fs-shell') ?? document.body)
  }, [])
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [isConnectingWorkspace, setIsConnectingWorkspace] = useState(false)
  const dragDepthRef = useRef(0)
  const uploads = useAiAttachments()
  const project = useAiWorkspaces()
  const [referenceTerminal, setReferenceTerminal] = useState(false)
  const [isSshConnecting, setIsSshConnecting] = useState(false)
  const sendOperationRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const sshOperationRef = useRef(false)
  const sshBindingRef = useRef<AiSshBinding | null>(null)
  const [commandActionMessage, setCommandActionMessage] = useState<string | null>(null)
  const [conversationSearch, setConversationSearch] = useState('')
  const [historyWorkspace, setHistoryWorkspace] = useState('')
  const [isConversationListOpen, setIsConversationListOpen] = useState(false)
  const [isRenamingConversation, setIsRenamingConversation] = useState(false)
  const [conversationTitleDraft, setConversationTitleDraft] = useState('')
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false)
  const [conversationPendingDeletion, setConversationPendingDeletion] = useState<AiConversationSummary | null>(null)
  const [messagePendingDeletion, setMessagePendingDeletion] = useState<AiMessage | null>(null)
  const [isDeletingConversation, setIsDeletingConversation] = useState(false)
  const [isDeletingMessage, setIsDeletingMessage] = useState(false)
  const composerCompositionRef = useRef(false)
  const panelRef = useRef<HTMLElement>(null)
  const messageViewportRef = useRef<HTMLDivElement>(null)
  const commandFeedbackTimerRef = useRef<number | null>(null)

  const showCommandActionMessage = (message: string) => {
    if (commandFeedbackTimerRef.current !== null) {
      window.clearTimeout(commandFeedbackTimerRef.current)
    }
    setCommandActionMessage(message)
    commandFeedbackTimerRef.current = window.setTimeout(() => {
      setCommandActionMessage(null)
      commandFeedbackTimerRef.current = null
    }, COMMAND_FEEDBACK_DISMISS_MS)
  }

  useEffect(() => {
    return () => {
      sshBindingRef.current = null
      if (commandFeedbackTimerRef.current !== null) {
        window.clearTimeout(commandFeedbackTimerRef.current)
      }
    }
  }, [])

  useAiPanelSelection(panelRef)
  const {
    providers,
    conversations,
    conversation,
    currentProvider,
    selectedProviderId,
    selectedModel,
    isLoading,
    isStreaming,
    errorMessage,
    usage,
    toolActivities,
    toolApprovalRequests,
    resolvingToolApprovalIds,
    isContextPreviewing,
    modeState,
    reasoningEffort,
    selectProvider,
    selectModel,
    selectReasoningEffort,
    loadConversation,
    newChat,
    renameConversation,
    deleteMessage,
    deleteConversation,
    createContextPreview,
    sendMessage,
    setCopilotMode,
    setContextAttach,
    setDangerousCommandRestrictions,
    resolveToolApproval,
    executeAiTerminalHandoff,
    retry,
    stop
  } = useAiCopilot(project.selectedId)

  const drafts = useAiChatDrafts({
    conversationId: conversation?.id,
    workspaceId: project.selectedId,
    providerId: selectedProviderId,
    providerIds: providers.map((provider) => provider.id),
    model: selectedModel,
    loading: isLoading,
    uploads,
    loadConversation,
    selectWorkspace: project.select,
    selectProvider,
    selectModel
  })
  const { draft, setDraft } = drafts
  const history = useAiHistorySearch(conversations, conversationSearch, historyWorkspace)

  useEffect(() => {
    if (conversation) project.select(conversation.workspaceId ?? null)
  }, [conversation?.id, conversation?.workspaceId, project.select])

  useEffect(() => {
    setIsRenamingConversation(false)
    setIsDeleteConfirmationOpen(false)
    setMessagePendingDeletion(null)
    setConversationTitleDraft(conversation?.title ?? '')
  }, [conversation?.id, conversation?.title])

  useEffect(() => {
    if (!modeState) return
    setReferenceTerminal(modeState.attachTerminalContext)
  }, [modeState])

  const canChat = Boolean(currentProvider)
  const copilotMode: AiCopilotMode = modeState?.mode ?? 'pure-conversation'
  const modeControls = useAiCopilotModeControls({
    mode: copilotMode,
    modeState,
    isStreaming,
    sshBusy: () => sshOperationRef.current,
    setMode: setCopilotMode,
    setRestrictions: setDangerousCommandRestrictions
  })
  const { selectCopilotMode, dangerousCommandRestrictionsEnabled, toggleDangerousCommandRestrictions } = modeControls
  const showsDangerousCommandRestrictions = copilotMode !== 'pure-conversation'
  const requiresTerminalContext = copilotMode !== 'pure-conversation' || referenceTerminal
  const canRetry = Boolean(
    errorMessage && (conversation?.messages.at(-1)?.role === 'user' || conversation?.task?.status === 'interrupted')
  )
  const isSshTarget = activeTab?.sessionType === 'ssh' && isTerminalTarget && Boolean(rootTab)
  const isSshAttached = isSshTarget && copilotMode !== 'pure-conversation' && referenceTerminal
  const workspaceMismatch =
    project.selected &&
    (!isTerminalTarget ||
      activeTab?.sessionType !== project.selected.kind ||
      (project.selected.kind === 'ssh' &&
        (activeTab?.profileId !== project.selected.profileId || activeSession?.accessHost !== project.selected.host)))
  const workspaceBusy =
    isStreaming ||
    isSshConnecting ||
    uploads.isReading ||
    isConnectingWorkspace ||
    isContextPreviewing ||
    isSubmitting ||
    drafts.restoring
  useAiFileDrop(panelRef, uploads, workspaceBusy || !canChat)
  const contextFiles = useAiContextFiles({
    workspace: project.selected,
    activeTab,
    activeSession,
    disabled: workspaceBusy || !canChat,
    onAdd: (files) => void uploads.addFiles(files)
  })
  const branches = useAiMessageBranches({
    conversation,
    disabled: workspaceBusy,
    loadConversation,
    setMode: () => setCopilotMode('pure-conversation'),
    setContextAttach: () => setContextAttach(false),
    setDraft,
    uploads,
    navigate: drafts.navigate,
    onError: showCommandActionMessage,
    sendMessage
  })

  const selectWorkspace = (id: string | null) => {
    if (workspaceBusy || sendOperationRef.current) return
    void drafts
      .navigate(
        () => {
          newChat()
          project.select(id)
        },
        null,
        id
      )
      .catch((error) => showCommandActionMessage(String(error)))
    setIsConversationListOpen(false)
  }
  const selectChat = (id: string) => {
    if (workspaceBusy || sendOperationRef.current) return
    void drafts
      .navigate(async () => {
        if (!(await loadConversation(id))) throw Error(aiConversationText().loadFailed)
      }, id)
      .catch((error) => showCommandActionMessage(String(error)))
    setIsConversationListOpen(false)
  }
  const workspaceActions = useAiWorkspaceActions({
    project,
    activeTab,
    rootTab,
    activeSession,
    onSelect: selectWorkspace
  })
  const connectWorkspace = async () => {
    const api = window.transterm
    if (!api || !project.selected || workspaceBusy) return
    setIsConnectingWorkspace(true)
    try {
      if (workspaceMismatch) {
        await onConnectWorkspace(project.selected)
        const snapshot = await api.getSnapshot()
        const tab = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId)
        if (
          tab?.sessionType !== project.selected.kind ||
          !snapshot.sessions[tab.id]?.connected ||
          (project.selected.kind === 'ssh' && tab.profileId !== project.selected.profileId)
        )
          throw new Error(t.aiWorkspaceMismatch)
      }
      await setCopilotMode('semi-automatic')
    } catch (error) {
      showCommandActionMessage(String(error))
    } finally {
      setIsConnectingWorkspace(false)
    }
  }
  const sshHost = activeSession?.accessHost || activeTab?.title || ''
  sshBindingRef.current =
    isSshTarget && currentProvider && activeTab && rootTab && activeSession?.aiSessionRevision
      ? {
          tabId: activeTab.id,
          rootTabId: rootTab.id,
          providerId: currentProvider.id,
          sessionRevision: activeSession.aiSessionRevision
        }
      : null

  const toggleSshConnection = async () => {
    if (sshOperationRef.current || isStreaming || isContextPreviewing || !sshBindingRef.current) return
    sshOperationRef.current = true
    setIsSshConnecting(true)
    setCommandActionMessage(null)
    try {
      if (isSshAttached) {
        if (!(await setCopilotMode('pure-conversation'))) return
        if (!(await setContextAttach(false))) return
        showCommandActionMessage(t.aiSshDisconnectedFeedback)
      } else {
        const target = await connectAiToCurrentSsh({
          getBinding: () => sshBindingRef.current,
          createPreview: createContextPreview,
          setMode: setCopilotMode,
          targetChangedMessage: t.aiSshTargetChanged
        })
        if (target) showCommandActionMessage(formatMessage(t.aiSshConnectedFeedback, { host: target.displayHost }))
      }
    } catch (error) {
      showCommandActionMessage(error instanceof Error ? error.message : String(error))
    } finally {
      sshOperationRef.current = false
      setIsSshConnecting(false)
    }
  }

  const openNewConversation = () => {
    if (workspaceBusy || sshOperationRef.current || sendOperationRef.current) return
    void drafts
      .navigate(() => newChat(), null, project.selectedId)
      .catch((error) => showCommandActionMessage(String(error)))
    setConversationSearch('')
    setIsConversationListOpen(false)
  }

  const send = async () => {
    if (sendOperationRef.current) return
    sendOperationRef.current = true
    setIsSubmitting(true)
    try {
      await submitMessage()
    } finally {
      sendOperationRef.current = false
      setIsSubmitting(false)
    }
  }

  const submitMessage = async () => {
    if (
      (!draft.trim() && !uploads.attachments.length) ||
      isStreaming ||
      sshOperationRef.current ||
      uploads.isReading ||
      drafts.restoring ||
      isConnectingWorkspace
    )
      return
    if (requiresTerminalContext && workspaceMismatch) {
      showCommandActionMessage(t.aiWorkspaceMismatch)
      return
    }
    const submittedDraft = draft
    const submittedSnapshot = drafts.snapshot()
    const shouldAttachContext = copilotMode !== 'pure-conversation' || referenceTerminal

    let contextSnapshot: Awaited<ReturnType<typeof createContextPreview>> = null
    if (shouldAttachContext) {
      if (!currentProvider || !activeTab || !rootTab || !isTerminalTarget) {
        showCommandActionMessage(t.aiCopilotContextUnavailable)
        return
      }
      setCommandActionMessage(null)
      contextSnapshot = await createContextPreview({
        tabId: activeTab.id,
        rootTabId: rootTab.id,
        providerId: currentProvider.id,
        mode: 'L2'
      })
      if (!contextSnapshot) return
    }

    const sent = await sendMessage(draft.trim() || t.aiAttachmentDefaultPrompt, {
      attachments: uploads.attachments.map((file) => file.upload),
      attachmentMetadata: uploads.attachments.map((file) => ({
        id: `pending-${file.id}`,
        name: file.name,
        kind: file.kind,
        size: file.size,
        mime: ''
      })),
      mode: copilotMode,
      ...(contextSnapshot
        ? {
            contextSnapshotId: contextSnapshot.snapshotId,
            contextPreview: contextSnapshot
          }
        : {})
    })
    if (sent) {
      void drafts.markSubmitted(submittedSnapshot).catch((error) => showCommandActionMessage(String(error)))
      setDraft((current) => (current === submittedDraft ? '' : current))
      uploads.clear()
    }
  }

  const retryLastRequest = async () => {
    if (workspaceBusy || sshOperationRef.current) return
    if (requiresTerminalContext && workspaceMismatch) {
      showCommandActionMessage(t.aiWorkspaceMismatch)
      return
    }
    const shouldAttachContext = copilotMode !== 'pure-conversation' || referenceTerminal
    let contextSnapshot: Awaited<ReturnType<typeof createContextPreview>> = null
    if (shouldAttachContext) {
      if (!currentProvider || !activeTab || !rootTab || !isTerminalTarget) {
        showCommandActionMessage(t.aiCopilotContextUnavailable)
        return
      }
      setCommandActionMessage(null)
      contextSnapshot = await createContextPreview({
        tabId: activeTab.id,
        rootTabId: rootTab.id,
        providerId: currentProvider.id,
        mode: 'L2'
      })
      if (!contextSnapshot) return
    }
    await retry({
      mode: copilotMode,
      ...(contextSnapshot ? { contextSnapshotId: contextSnapshot.snapshotId } : {})
    })
  }

  const toggleTerminalReference = () => {
    if (isStreaming || isContextPreviewing || sshOperationRef.current) return
    setCommandActionMessage(null)
    const next = !referenceTerminal
    setReferenceTerminal(next)
    void setContextAttach(next).then((state) => {
      if (!state) setReferenceTerminal(referenceTerminal)
    })
  }

  const executeCommandInTerminal = (activity: AiToolActivity) =>
    handoffAiCommand(activity, activeTab, isTerminalTarget, executeAiTerminalHandoff, showCommandActionMessage)

  const saveConversationTitle = async () => {
    if (!conversation) return
    const saved = await renameConversation(conversation.id, conversationTitleDraft)
    if (saved) {
      setIsRenamingConversation(false)
      setConversationTitleDraft('')
    }
  }

  const deleteCurrentConversation = async () => {
    if (!conversation) return
    const deleted = await deleteChat(conversation.id)
    if (deleted) {
      setIsDeleteConfirmationOpen(false)
      setConversationSearch('')
    }
  }

  const deleteChat = async (id: string) => {
    if (conversation?.id !== id) return deleteConversation(id)
    let deleted = false
    await drafts
      .navigate(
        async () => {
          deleted = await deleteConversation(id)
          if (!deleted) throw Error(aiConversationText().loadFailed)
        },
        null,
        project.selectedId
      )
      .catch((error) => showCommandActionMessage(String(error)))
    return deleted
  }

  const confirmConversationDeletion = async () => {
    if (!conversationPendingDeletion) return
    setIsDeletingConversation(true)
    const deleted = await deleteChat(conversationPendingDeletion.id)
    setIsDeletingConversation(false)
    if (deleted) {
      setConversationPendingDeletion(null)
      setConversationSearch('')
    }
  }

  const confirmMessageDeletion = async () => {
    if (!messagePendingDeletion || !conversation || isStreaming) return
    setIsDeletingMessage(true)
    const deleted = await deleteMessage(conversation.id, messagePendingDeletion.id)
    setIsDeletingMessage(false)
    if (deleted) {
      setMessagePendingDeletion(null)
    }
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === '@' && !event.nativeEvent.isComposing && !draft.trim() && !workspaceBusy) {
      event.preventDefault()
      contextFiles.open()
      return
    }
    // Some macOS input methods report `isComposing` as false on the Enter
    // keydown that commits a candidate. keyCode 229 and the explicit
    // composition ref cover both browser event orderings.
    if (
      event.key !== 'Enter' ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229 ||
      composerCompositionRef.current ||
      isStreaming ||
      event.shiftKey
    ) {
      return
    }
    event.preventDefault()
    void send()
  }

  const panel = (
    <aside
      ref={panelRef}
      aria-label={t.aiCopilot}
      className={`ai-copilot-panel ${isResizing ? 'is-resizing' : ''} ${isDraggingFiles ? 'is-file-drop' : ''}`}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files') || workspaceBusy) return
        event.preventDefault()
        dragDepthRef.current++
        setIsDraggingFiles(true)
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = workspaceBusy ? 'none' : 'copy'
        }
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (!dragDepthRef.current) setIsDraggingFiles(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        dragDepthRef.current = 0
        setIsDraggingFiles(false)
        if (!workspaceBusy && canChat) void uploads.addFiles(Array.from(event.dataTransfer.files))
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        aria-label="调整 AI 侧边栏宽度"
        className={`ai-copilot-resizer ${isResizing ? 'is-active' : ''}`}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onResizeStart?.()
        }}
        role="separator"
      />
      <AiCopilotHeader
        canChat={canChat}
        isStreaming={workspaceBusy}
        isHistoryOpen={isConversationListOpen}
        onOpenHistory={() => setIsConversationListOpen((open) => !open)}
        onClose={() => {
          void drafts
            .flush()
            .then(onClose)
            .catch((error) => showCommandActionMessage(String(error)))
        }}
        onOpenSettings={onOpenSettings}
        openNewConversation={openNewConversation}
      />
      {isDraggingFiles ? (
        <div className="ai-file-drop-overlay">
          <AppIcon name="ai-upload" size={30} />
          <span>{t.aiAttachmentDrop}</span>
        </div>
      ) : null}
      <section className="ai-copilot-chat" aria-label={t.aiCopilot}>
        <AiWorkspaceControls
          project={project}
          actions={workspaceActions}
          disabled={workspaceBusy}
          onSelect={selectWorkspace}
        />
        {project.selected && (workspaceMismatch || copilotMode === 'pure-conversation') ? (
          <div className="ai-workspace-connect">
            <Button
              variant="secondary"
              size="compact"
              disabled={!canChat || workspaceBusy}
              aria-busy={isConnectingWorkspace}
              onClick={() => void connectWorkspace()}
            >
              <AppIcon name={project.selected.kind === 'ssh' ? 'ai-server' : 'ai-terminal'} size={13} />
              {t.aiWorkspaceConnect}
            </Button>
          </div>
        ) : null}
        <div
          className={`ai-copilot-content ${canChat ? 'has-chat' : ''} ${isConversationListOpen ? 'is-conversation-list' : ''}`}
        >
          {isLoading ? (
            <div className="ai-copilot-loading" role="status">
              <AppIcon name="ai-loading" size={16} />
              {t.aiCopilotLoading}
            </div>
          ) : !canChat ? (
            <AiCopilotSetup onOpenSettings={onOpenSettings} />
          ) : isConversationListOpen ? (
            <AiCopilotConversationList
              conversation={conversation}
              conversationSearch={conversationSearch}
              filteredConversations={history.results}
              workspaces={project.workspaces}
              workspaceFilter={historyWorkspace}
              onWorkspaceFilter={setHistoryWorkspace}
              error={history.error}
              isStreaming={workspaceBusy}
              loadConversation={async (id) => selectChat(id)}
              onCloseConversationList={() => setIsConversationListOpen(false)}
              onDeleteConversation={(item) => setConversationPendingDeletion(item)}
              openNewConversation={openNewConversation}
              setConversationSearch={setConversationSearch}
            />
          ) : (
            <>
              <AiCopilotChatMeta
                commandActionMessage={commandActionMessage}
                conversation={conversation}
                conversationTitleDraft={conversationTitleDraft}
                deleteCurrentConversation={deleteCurrentConversation}
                isDeleteConfirmationOpen={isDeleteConfirmationOpen}
                isRenamingConversation={isRenamingConversation}
                isStreaming={workspaceBusy}
                onOpenConversationList={() => setIsConversationListOpen(true)}
                saveConversationTitle={saveConversationTitle}
                setConversationTitleDraft={setConversationTitleDraft}
                setIsDeleteConfirmationOpen={setIsDeleteConfirmationOpen}
                setIsRenamingConversation={setIsRenamingConversation}
              />

              <AiCopilotMessageList
                canRetry={canRetry}
                conversation={conversation}
                errorMessage={errorMessage}
                executeCommandInTerminal={executeCommandInTerminal}
                isStreaming={isStreaming}
                messageViewportRef={messageViewportRef}
                onDeleteMessage={(message) => setMessagePendingDeletion(message)}
                onRetryLastRequest={retryLastRequest}
                resolveToolApproval={resolveToolApproval}
                resolvingToolApprovalIds={resolvingToolApprovalIds}
                toolActivities={toolActivities}
                toolApprovalRequests={toolApprovalRequests}
                onEditMessage={branches.onEdit}
                onBranchMessage={branches.onBranch}
              />
              <div className="ai-conversation-task-footer">
                <AiTaskSummary
                  conversation={conversation}
                  busy={workspaceBusy}
                  onResume={() => void retryLastRequest()}
                />
                {usage ? (
                  <div className="ai-copilot-usage" aria-label={t.aiCopilotUsage}>
                    {t.aiCopilotUsage}: {usage.inputTokens ?? '—'} / {usage.outputTokens ?? '—'}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        {!isConversationListOpen ? (
          <AiCopilotComposer
            canChat={canChat}
            composerCompositionRef={composerCompositionRef}
            copilotMode={copilotMode}
            copilotModeDescription={copilotModeDescription}
            copilotModeIconName={copilotModeIconName}
            currentProvider={currentProvider}
            draft={draft}
            isContextPreviewing={isContextPreviewing || isSubmitting}
            isStreaming={isStreaming}
            isSshConnecting={isSshConnecting}
            isRestoringDraft={drafts.restoring}
            attachments={uploads.attachments}
            isReadingAttachments={uploads.isReading}
            attachmentError={uploads.error || drafts.error}
            onReferenceFile={contextFiles.open}
            onAttachFiles={(files) => {
              if (!workspaceBusy) void uploads.addFiles(files)
            }}
            onRemoveAttachment={uploads.remove}
            isTerminalTarget={isTerminalTarget}
            onComposerKeyDown={onComposerKeyDown}
            providers={providers}
            referenceTerminal={referenceTerminal}
            sshControl={
              <AiSshControl
                available={isSshTarget && Boolean(sshBindingRef.current)}
                hasProvider={canChat}
                connected={isSshAttached}
                busy={isSshConnecting}
                disabled={isStreaming || isContextPreviewing}
                host={sshHost}
                onToggle={() => void toggleSshConnection()}
              />
            }
            reaControl={
              <AiReaControl
                activeSession={activeSession}
                activeTab={activeTab}
                rootTab={rootTab}
                mode={copilotMode}
                isStreaming={isStreaming}
                onAnalyze={(target) =>
                  setDraft(
                    formatMessage(/^https?:\/\//i.test(target) ? t.reaAnalyzeUrlPrompt : t.reaAnalyzePrompt, {
                      path: target
                    })
                  )
                }
              />
            }
            reasoningEffort={reasoningEffort}
            requiresTerminalContext={requiresTerminalContext}
            selectCopilotMode={selectCopilotMode}
            selectModel={selectModel}
            selectProvider={selectProvider}
            selectReasoningEffort={selectReasoningEffort}
            selectedModel={selectedModel}
            selectedProviderId={selectedProviderId}
            send={send}
            setDraft={setDraft}
            stop={stop}
            toggleTerminalReference={toggleTerminalReference}
          />
        ) : null}
        {!isConversationListOpen ? (
          <AiCopilotDangerousDock
            dangerousCommandRestrictionsEnabled={dangerousCommandRestrictionsEnabled}
            isStreaming={workspaceBusy}
            modeState={modeState}
            showsDangerousCommandRestrictions={showsDangerousCommandRestrictions}
            toggleDangerousCommandRestrictions={toggleDangerousCommandRestrictions}
          />
        ) : null}
      </section>
      {workspaceActions.dialogs}
      {contextFiles.dialog}
      {branches.dialog}
      {modeControls.confirmationDialog}
      {conversationPendingDeletion ? (
        <ConfirmActionDialog
          confirmLabel={t.delete}
          confirmVariant="danger"
          description={t.aiCopilotDeleteConversationConfirm}
          errorMessage={errorMessage}
          isSubmitting={isDeletingConversation}
          onClose={() => {
            if (!isDeletingConversation) setConversationPendingDeletion(null)
          }}
          onConfirm={() => void confirmConversationDeletion()}
          title={t.aiCopilotDeleteConversation}
        />
      ) : null}
      {messagePendingDeletion ? (
        <ConfirmActionDialog
          confirmLabel={t.aiCopilotDeleteMessage}
          confirmVariant="danger"
          description={t.aiCopilotDeleteMessageConfirm}
          errorMessage={errorMessage}
          isSubmitting={isDeletingMessage}
          onClose={() => {
            if (!isDeletingMessage) setMessagePendingDeletion(null)
          }}
          onConfirm={() => void confirmMessageDeletion()}
          title={t.aiCopilotDeleteMessage}
        />
      ) : null}
    </aside>
  )
  // The main area already reserves the sidebar width; anchor to the shell.
  return panelHost ? createPortal(panel, panelHost) : null
}
