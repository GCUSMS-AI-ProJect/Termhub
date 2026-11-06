import { useState } from 'react'
import { t } from '../../i18n'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'

export function AiRemoteWorkspaceDialog({
  host,
  initialPath,
  busy,
  error,
  onClose,
  onSave
}: {
  host: string
  initialPath: string
  busy: boolean
  error: string | null
  onClose(): void
  onSave(name: string, path: string): void
}) {
  const [path, setPath] = useState(initialPath)
  const [name, setName] = useState(initialPath.replace(/\/+$/, '').split('/').pop() || host)
  return (
    <ConfirmActionDialog
      title={t.aiWorkspaceAddRemote}
      confirmLabel={t.aiWorkspaceAdd}
      confirmVariant="primary"
      confirmDisabled={!path.startsWith('/') || !name.trim()}
      errorMessage={error}
      isSubmitting={busy}
      onClose={onClose}
      onConfirm={() => onSave(name, path)}
      description={
        <div className="ai-workspace-form">
          <p>{host}</p>
          <label>
            {t.aiWorkspaceName}
            <input value={name} disabled={busy} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {t.aiWorkspacePath}
            <input
              value={path}
              disabled={busy}
              placeholder="/home/user/project"
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
          <small>{t.aiWorkspaceRemoteHint}</small>
        </div>
      }
    />
  )
}
