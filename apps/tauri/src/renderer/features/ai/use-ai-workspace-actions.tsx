import { useState } from 'react'
import type { AiWorkspace, SessionSnapshot, WorkspaceTab } from '@transterm/core'
import type { useAiWorkspaces } from './use-ai-workspaces'
import { AiRemoteWorkspaceDialog } from './ai-remote-workspace-dialog'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'
import { t } from '../../i18n'

export function useAiWorkspaceActions({
  project,
  activeTab,
  rootTab,
  activeSession,
  onSelect
}: {
  project: ReturnType<typeof useAiWorkspaces>
  activeTab: WorkspaceTab | null
  rootTab: WorkspaceTab | null
  activeSession: SessionSnapshot | null
  onSelect(id: string | null): void
}) {
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [remoteTarget, setRemoteTarget] = useState<{
    tabId: string
    rootTabId: string
    revision: string
    host: string
    path: string
  } | null>(null)
  const [removing, setRemoving] = useState<AiWorkspace | null>(null)
  const canAddRemote =
    activeTab?.sessionType === 'ssh' &&
    activeSession?.connected === true &&
    activeSession.deviceMode !== 'network-device'
  const addLocal = async () => {
    const workspace = await project.addLocal()
    if (workspace) onSelect(workspace.id)
  }
  const saveRemote = async (name: string, path: string) => {
    if (
      !remoteTarget ||
      !canAddRemote ||
      activeTab?.id !== remoteTarget.tabId ||
      rootTab?.id !== remoteTarget.rootTabId ||
      activeSession?.aiSessionRevision !== remoteTarget.revision
    )
      return
    const workspace = await project.save({
      name,
      path,
      kind: 'ssh',
      tabId: remoteTarget.tabId,
      rootTabId: remoteTarget.rootTabId
    })
    if (workspace) {
      setRemoteOpen(false)
      onSelect(workspace.id)
    }
  }
  const dialogs = (
    <>
      {remoteOpen &&
      remoteTarget &&
      activeTab?.id === remoteTarget.tabId &&
      rootTab?.id === remoteTarget.rootTabId &&
      activeSession?.aiSessionRevision === remoteTarget.revision ? (
        <AiRemoteWorkspaceDialog
          host={remoteTarget.host}
          initialPath={remoteTarget.path}
          busy={project.busy}
          error={project.error}
          onClose={() => setRemoteOpen(false)}
          onSave={(name, path) => void saveRemote(name, path)}
        />
      ) : null}
      {removing ? (
        <ConfirmActionDialog
          title={t.aiWorkspaceRemove}
          description={t.aiWorkspaceRemoveHint}
          confirmLabel={t.aiWorkspaceRemove}
          isSubmitting={project.busy}
          errorMessage={project.error}
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            void project.remove(removing.id).then((done) => {
              if (done) {
                if (removing.id === project.selectedId) onSelect(null)
                setRemoving(null)
              }
            })
          }}
        />
      ) : null}
    </>
  )
  return {
    addLocal: () => void addLocal(),
    addRemote: () => {
      if (!canAddRemote || !activeTab || !rootTab || !activeSession?.aiSessionRevision) return
      setRemoteTarget({
        tabId: activeTab.id,
        rootTabId: rootTab.id,
        revision: activeSession.aiSessionRevision,
        host: activeSession.accessHost ?? '',
        path: activeSession.shellCwd || activeSession.remotePath || '/'
      })
      setRemoteOpen(true)
    },
    remove: setRemoving,
    canAddRemote,
    dialogs
  }
}
