import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DirectorySyncInput, DirectorySyncPreview } from '@transterm/core'
import { Button } from '../../components/common/button/button'
import { DropdownSelect } from '../common/dropdown-select'
import { SelectionControl } from '../common/selection-control'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'
import { CloseButton } from '../common/close-button'
import { VerticalScrollbar } from '../common/vertical-scrollbar'
import { syncText } from './directory-sync-text'
import './directory-sync-dialog.css'

export type DirectorySyncTarget = Omit<DirectorySyncInput, 'requestId' | 'ignorePatterns'>
export const DIRECTORY_SYNC_EVENT = 'transterm:directory-sync'
export function requestDirectorySync(target: DirectorySyncTarget) {
  window.dispatchEvent(new CustomEvent(DIRECTORY_SYNC_EVENT, { detail: target }))
}

export function DirectorySyncLauncher() {
  const [target, setTarget] = useState<DirectorySyncTarget | null>(null)
  useEffect(() => {
    const open = (event: Event) => setTarget((event as CustomEvent<DirectorySyncTarget>).detail)
    window.addEventListener(DIRECTORY_SYNC_EVENT, open)
    return () => window.removeEventListener(DIRECTORY_SYNC_EVENT, open)
  }, [])
  return target ? <DirectorySyncDialog target={target} onClose={() => setTarget(null)} /> : null
}

function DirectorySyncDialog({ target, onClose }: { target: DirectorySyncTarget; onClose(): void }) {
  const text = syncText()
  const [input, setInput] = useState(target)
  const [ignores, setIgnores] = useState('.git\nnode_modules\n.DS_Store')
  const [preview, setPreview] = useState<DirectorySyncPreview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const requestRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const rows =
    preview?.entries.filter((entry) => entry.path.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) ?? []
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 6
  })
  useEffect(() => {
    dialogRef.current?.focus()
    return () => {
      const requestId = requestRef.current
      requestRef.current = null
      if (requestId) void window.transterm?.cancelDirectorySyncPreview(requestId)
    }
  }, [])
  const changeInput = (patch: Partial<DirectorySyncTarget>) => {
    setInput((value) => ({ ...value, ...patch }))
    setPreview(null)
    setQueued(false)
  }
  const scan = async () => {
    if (!window.transterm || busy || applying) return
    const id = crypto.randomUUID()
    requestRef.current = id
    setBusy(true)
    setError('')
    setPreview(null)
    setQueued(false)
    try {
      const result = await window.transterm.previewDirectorySync({
        ...input,
        requestId: id,
        ignorePatterns: ignores
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      })
      if (requestRef.current !== id) return
      setPreview(result)
      setSelected(new Set(result.entries.filter((entry) => entry.status !== 'unchanged').map((entry) => entry.path)))
    } catch (e) {
      if (requestRef.current === id) setError(String(e))
    } finally {
      if (requestRef.current === id) {
        requestRef.current = null
        setBusy(false)
      }
    }
  }
  const apply = async () => {
    if (!window.transterm || !preview || applying || !selected.size) return
    setApplying(true)
    setError('')
    try {
      await window.transterm.applyDirectorySync(preview.id, [...selected])
      setQueued(true)
      setPreview(null)
      setConfirm(false)
    } catch (e) {
      setError(String(e))
      setConfirm(false)
      setPreview(null)
    } finally {
      setApplying(false)
    }
  }
  const close = () => {
    if (!applying) onClose()
  }
  return createPortal(
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-sync-title"
        className="modal-card directory-sync-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !confirm) {
            event.stopPropagation()
            close()
          }
        }}
      >
        <header>
          <h2 id="directory-sync-title">{text.title}</h2>
          <CloseButton disabled={applying} onClick={close} />
        </header>
        <div className="directory-sync-body-wrap">
          <div className="directory-sync-body" ref={bodyScrollRef}>
            <div className="directory-sync-fields">
              <label>
                <span>{text.direction}</span>
                <DropdownSelect
                  value={input.direction}
                  options={[
                    { value: 'upload', label: text.upload },
                    { value: 'download', label: text.download }
                  ]}
                  disabled={busy || applying}
                  onChange={(value) => changeInput({ direction: value as 'upload' | 'download' })}
                />
              </label>
              <label>
                <span>{text.local}</span>
                <input
                  value={input.localDirectory}
                  disabled={busy || applying}
                  onChange={(event) => changeInput({ localDirectory: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>{text.remote}</span>
                <input
                  value={input.remoteDirectory}
                  disabled={busy || applying}
                  onChange={(event) => changeInput({ remoteDirectory: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>{text.ignores}</span>
                <textarea
                  rows={3}
                  value={ignores}
                  disabled={busy || applying}
                  onChange={(event) => {
                    setIgnores(event.currentTarget.value)
                    setPreview(null)
                  }}
                />
              </label>
            </div>
            <p>{text.hint}</p>
            {preview ? (
              <>
                <div className="directory-sync-actions">
                  <label>
                    <SelectionControl
                      type="checkbox"
                      checked={rows.length > 0 && rows.every((entry) => selected.has(entry.path))}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked
                        setSelected((old) => {
                          const next = new Set(old)
                          for (const entry of rows) {
                            if (checked) next.add(entry.path)
                            else next.delete(entry.path)
                          }
                          return next
                        })
                      }}
                      disabled={applying}
                    />
                    {text.all}
                  </label>
                  <input
                    type="search"
                    aria-label={text.filter}
                    placeholder={text.filter}
                    value={filter}
                    onChange={(event) => setFilter(event.currentTarget.value)}
                  />
                </div>
                <div className="directory-sync-list-wrap">
                  <div className="directory-sync-list" ref={scrollRef}>
                    {rows.length ? (
                      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                        {virtualizer.getVirtualItems().map((item) => {
                          const entry = rows[item.index]
                          return (
                            <label
                              key={entry.path}
                              className="directory-sync-row"
                              style={{ transform: `translateY(${item.start}px)` }}
                            >
                              <SelectionControl
                                type="checkbox"
                                checked={selected.has(entry.path)}
                                disabled={applying}
                                onChange={(event) => {
                                  const checked = event.currentTarget.checked
                                  setSelected((old) => {
                                    const next = new Set(old)
                                    if (checked) next.add(entry.path)
                                    else next.delete(entry.path)
                                    return next
                                  })
                                }}
                              />
                              <span title={entry.path}>{entry.path}</span>
                              <small>{text[entry.status]}</small>
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      <p>{text.noFiles}</p>
                    )}
                  </div>
                  <VerticalScrollbar scrollRef={scrollRef} ariaLabel={text.title} />
                </div>
                <p>{text.selected.replace('{count}', String(selected.size))}</p>
              </>
            ) : null}
            {queued ? <p role="status">{text.queued}</p> : null}
            {error ? (
              <p className="directory-sync-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <VerticalScrollbar scrollRef={bodyScrollRef} ariaLabel={text.title} />
        </div>
        <footer>
          <Button variant="ghost" disabled={applying} onClick={close}>
            {busy ? text.cancel : text.close}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || applying || !input.localDirectory || !input.remoteDirectory}
            onClick={() => void scan()}
          >
            {busy ? text.scanning : text.preview}
          </Button>
          {preview ? (
            <Button
              disabled={busy || applying || !selected.size}
              onClick={() =>
                preview.entries.some((entry) => selected.has(entry.path) && entry.status !== 'new')
                  ? setConfirm(true)
                  : void apply()
              }
            >
              {applying ? text.applying : text.apply}
            </Button>
          ) : null}
        </footer>
        {confirm ? (
          <ConfirmActionDialog
            title={text.apply}
            description={text.replace}
            confirmLabel={text.apply}
            isSubmitting={applying}
            onClose={() => setConfirm(false)}
            onConfirm={() => void apply()}
          />
        ) : null}
      </section>
    </div>,
    document.body
  )
}
