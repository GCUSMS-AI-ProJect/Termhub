import { useEffect, useRef, useState } from 'react'
import type { AiWorkspace, RemoteFileItem, SessionSnapshot, WorkspaceTab } from '@transterm/core'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'
import { DropdownSelect } from '../common/dropdown-select'
import { VerticalScrollbar } from '../common/vertical-scrollbar'
import { AppIcon } from '../common/app-icon'
import { aiConversationText } from './ai-conversation-text'
import type { AiFileReferenceInput } from './ai-file-reference-events'
import './ai-context-files.css'
import { buildAiFileExcerpt } from './ai-file-excerpt'

export function AiFileReferenceDialog({
  initial,
  workspace,
  activeTab,
  activeSession,
  onClose,
  onAdd
}: {
  initial: AiFileReferenceInput | null
  workspace: AiWorkspace | null
  activeTab: WorkspaceTab | null
  activeSession: SessionSnapshot | null
  onClose(): void
  onAdd(files: File[]): void
}) {
  const text = aiConversationText()
  const [kind, setKind] = useState<'local' | 'ssh'>(initial?.kind ?? workspace?.kind ?? 'local')
  const [path, setPath] = useState(initial?.path ?? workspace?.path ?? '')
  const [files, setFiles] = useState<RemoteFileItem[]>([])
  const [content, setContent] = useState('')
  const [readPath, setReadPath] = useState('')
  const [first, setFirst] = useState(1)
  const [last, setLast] = useState(100)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLPreElement>(null)
  const target = useRef({
    tabId: initial?.tabId ?? activeTab?.id,
    revision: activeSession?.aiSessionRevision,
    host: !initial && workspace?.kind === 'ssh' ? workspace.host : undefined,
    profileId: !initial && workspace?.kind === 'ssh' ? workspace.profileId : undefined
  })
  const current = useRef({ activeTab, activeSession })
  current.current = { activeTab, activeSession }
  const canRemote = activeTab?.sessionType === 'ssh' && activeSession?.connected
  const lines = content.split(/\r?\n/)
  const excerpt = buildAiFileExcerpt(
    content,
    readPath,
    kind === 'ssh' ? (activeSession?.accessHost ?? 'SSH') : 'local',
    first,
    last
  )
  const { selected, size: selectedBytes } = excerpt
  const requireTarget = () => {
    if (
      kind === 'ssh' &&
      (!current.current.activeSession?.connected ||
        current.current.activeTab?.id !== target.current.tabId ||
        (target.current.host && current.current.activeSession.accessHost !== target.current.host) ||
        (target.current.profileId && current.current.activeTab?.profileId !== target.current.profileId) ||
        current.current.activeSession.aiSessionRevision !== target.current.revision)
    )
      throw Error(text.targetChanged)
  }
  const read = async (value = path) => {
    const api = window.transterm
    if (!api || busy) return
    setBusy(true)
    setError(null)
    try {
      requireTarget()
      const valueText =
        kind === 'ssh' ? await api.readRemoteFile(target.current.tabId!, value) : await api.readLocalFile(value)
      requireTarget()
      setContent(valueText)
      setReadPath(value)
      setFirst(1)
      setLast(Math.min(100, valueText.split(/\r?\n/).length))
      setFiles([])
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  const browse = async (value = path) => {
    const api = window.transterm
    if (!api || busy) return
    setBusy(true)
    setError(null)
    try {
      requireTarget()
      const entries =
        kind === 'ssh'
          ? await api.listRemoteDirectory(target.current.tabId!, value)
          : (await api.listLocalDirectory(value || undefined)).items
      requireTarget()
      setFiles(entries)
      setContent('')
      setReadPath('')
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (initial) void read(initial.path)
  }, [])
  const add = () => {
    try {
      requireTarget()
      if (excerpt.size > 128 * 1024) throw Error(text.tooLarge)
      onAdd([new File([excerpt.text], excerpt.name, { type: 'text/plain' })])
      onClose()
    } catch (error) {
      setError(String(error))
    }
  }
  return (
    <ConfirmActionDialog
      className="ai-context-file-dialog"
      title={text.preview}
      confirmVariant="primary"
      confirmLabel={text.add}
      cancelLabel={text.cancel}
      isSubmitting={busy}
      confirmDisabled={!readPath || !selected || selectedBytes > 128 * 1024}
      errorMessage={error}
      onClose={onClose}
      onConfirm={add}
      description={
        <div className="ai-context-files">
          <DropdownSelect
            ariaLabel={text.source}
            value={kind}
            disabled={busy}
            options={[
              { value: 'local', label: text.local },
              { value: 'ssh', label: text.remote, disabled: !canRemote }
            ]}
            onChange={(value) => {
              setKind(value as 'local' | 'ssh')
              setContent('')
              setFiles([])
              setReadPath('')
              target.current = {
                tabId: activeTab?.id,
                revision: activeSession?.aiSessionRevision,
                host: undefined,
                profileId: undefined
              }
              setPath(value === 'ssh' ? (activeSession?.remotePath ?? '/') : '')
            }}
          />
          <label>
            {text.path}
            <input
              value={path}
              disabled={busy}
              onChange={(event) => {
                setPath(event.target.value)
                setContent('')
                setReadPath('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void read()
                }
              }}
            />
          </label>
          <div className="ai-context-file-actions">
            <button type="button" disabled={busy} onClick={() => void browse()}>
              <AppIcon name="ai-folder" size={15} />
              {text.browse}
            </button>
            <button type="button" disabled={busy || !path} onClick={() => void read()}>
              <AppIcon name="ai-document" size={15} />
              {text.read}
            </button>
          </div>
          {files.length ? (
            <div className="ai-context-file-list-wrap">
              <div ref={listRef} className="ai-context-file-list">
                {files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => {
                      setPath(file.path)
                      if (file.type === 'folder') void browse(file.path)
                      else void read(file.path)
                    }}
                  >
                    <AppIcon name={file.type === 'folder' ? 'ai-folder' : 'ai-document'} size={15} />
                    <span>{file.name}</span>
                  </button>
                ))}
              </div>
              <VerticalScrollbar scrollRef={listRef} />
            </div>
          ) : null}
          {readPath ? (
            <>
              <div className="ai-context-file-range">
                <label>
                  {text.fromLine}
                  <input
                    type="number"
                    min={1}
                    max={lines.length}
                    value={first}
                    onChange={(event) => {
                      const value = Math.max(1, Math.min(lines.length, Math.floor(Number(event.target.value) || 1)))
                      setFirst(value)
                      setLast((previous) => Math.max(previous, value))
                    }}
                  />
                </label>
                <label>
                  {text.toLine}
                  <input
                    type="number"
                    min={first}
                    max={lines.length}
                    value={last}
                    onChange={(event) =>
                      setLast(Math.max(first, Math.min(lines.length, Math.floor(Number(event.target.value) || first))))
                    }
                  />
                </label>
                <span>{Math.ceil(selectedBytes / 1024)} KB</span>
              </div>
              <div className="ai-context-file-preview-wrap">
                <pre ref={previewRef}>{selected}</pre>
                <VerticalScrollbar scrollRef={previewRef} />
              </div>
              <small>{text.selectedOnly}</small>
            </>
          ) : null}
        </div>
      }
    />
  )
}
