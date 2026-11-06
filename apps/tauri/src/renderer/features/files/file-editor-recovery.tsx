import { useRef, useState } from 'react'
import type { FileContentSnapshot } from '@transterm/core'
import { t } from '../../i18n'
import { Button } from '../../components/common/button/button'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'
import { FileChangeDiff } from './file-change-diff'

export function FileEditorRecovery({
  file,
  content,
  encoding,
  busy,
  onSave,
  onReload,
  onRecoveryBusyChange
}: {
  file: FileContentSnapshot
  content: string
  encoding: string
  busy: boolean
  onSave(content: string, encoding: string, resolution?: 'replace-external'): void
  onReload(encoding: string): void | Promise<void>
  onRecoveryBusyChange?(busy: boolean): void
}) {
  const [confirm, setConfirm] = useState<'replace' | 'reload' | 'undo' | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const draftRef = useRef({ content, encoding })
  draftRef.current = { content, encoding }
  const hasDraft = content !== file.content || encoding !== (file.encoding ?? 'utf-8')
  if (!file.conflict && !file.changeId) return null
  const undo = async () => {
    if (!file.changeId || !window.transterm || pending || hasDraft) return
    const originalDraft = draftRef.current
    setPending(true)
    onRecoveryBusyChange?.(true)
    setError('')
    try {
      const saved = await window.transterm.undoFileChange(file.changeId)
      if (draftRef.current.content === originalDraft.content && draftRef.current.encoding === originalDraft.encoding) {
        await onReload(saved.file.target.encoding ?? 'utf-8')
      } else {
        // The disk recovery completed, but typing during the request belongs
        // to the user. Keep that draft; its next save will run conflict review.
        setError(t.fileEditorUnsaved)
      }
      setConfirm(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setPending(false)
      onRecoveryBusyChange?.(false)
    }
  }
  return (
    <div className={file.conflict ? 'file-change-conflict' : 'file-change-toolbar'}>
      {file.conflict ? (
        <>
          <p>{t.fileChangeConflict}</p>
          <FileChangeDiff before={file.conflict.content} after={content} />
          <div className="file-change-toolbar">
            <Button size="compact" variant="ghost" disabled={busy || pending} onClick={() => setConfirm('reload')}>
              {t.fileChangeReload}
            </Button>
            <Button size="compact" disabled={busy || pending} onClick={() => setConfirm('replace')}>
              {t.fileChangeKeepMine}
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="compact"
          variant="ghost"
          disabled={busy || pending || hasDraft}
          onClick={() => setConfirm('undo')}
        >
          {t.fileChangeUndo}
        </Button>
      )}
      {error ? (
        <p role="alert" className="file-change-error">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <ConfirmActionDialog
          title={confirm === 'undo' ? t.fileChangeUndo : t.fileChangeConflict}
          confirmLabel={t.confirm}
          description={
            confirm === 'reload'
              ? t.fileChangeReloadHint
              : confirm === 'undo'
                ? t.fileChangeUndoHint
                : t.fileChangeReplaceHint
          }
          isSubmitting={pending}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'undo') void undo()
            else if (confirm === 'reload') {
              onReload(file.encoding ?? 'utf-8')
              setConfirm(null)
            } else {
              onSave(content, encoding, 'replace-external')
              setConfirm(null)
            }
          }}
        />
      ) : null}
    </div>
  )
}
