import { useState } from 'react'
import type { AiToolCallProposal } from '@transterm/core'
import { t } from '../../i18n'
import { Button } from '../../components/common/button/button'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'
import { FileChangeDiff } from '../files/file-change-diff'

export function AiFileChangePreview({
  change,
  changeId
}: {
  change?: AiToolCallProposal['fileChange']
  changeId?: string
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [undone, setUndone] = useState(false)
  const [error, setError] = useState('')
  if (!change && !changeId) return null
  const undo = async () => {
    if (!changeId || !window.transterm || busy) return
    setBusy(true)
    setError('')
    try {
      await window.transterm.undoFileChange(changeId)
      setUndone(true)
      setConfirm(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      {change ? (
        <>
          <p>{change.path}</p>
          <FileChangeDiff before={change.before} after={change.after} />
        </>
      ) : null}
      {changeId ? (
        <div className="file-change-toolbar">
          <Button variant="ghost" size="compact" disabled={busy || undone} onClick={() => setConfirm(true)}>
            {undone ? t.fileChangeUndone : t.fileChangeUndo}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="file-change-error" role="alert">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <ConfirmActionDialog
          title={t.fileChangeUndo}
          description={t.fileChangeUndoHint}
          confirmLabel={t.fileChangeUndo}
          isSubmitting={busy}
          onClose={() => setConfirm(false)}
          onConfirm={() => void undo()}
          errorMessage={error}
        />
      ) : null}
    </div>
  )
}
