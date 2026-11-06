import { useRef, useState } from 'react'
import type { AiAttachment } from '@transterm/core'
import { Button } from '../../components/common/button/button'
import { Tooltip } from '../../components/common/tooltip/tooltip'
import { AppIcon } from '../common/app-icon'
import { ConfirmActionDialog } from '../common/confirm-action-dialog'
import { VerticalScrollbar } from '../common/vertical-scrollbar'
import { t } from '../../i18n'
import { formatAttachmentSize, type PendingAiAttachment } from './ai-attachment-utils'
import './ai-attachments.css'

export function AiAttachmentButton({ disabled, onFiles }: { disabled: boolean; onFiles(files: File[]): void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        className="ai-attachment-input"
        ref={inputRef}
        type="file"
        multiple
        aria-label={t.aiAttachFiles}
        disabled={disabled}
        onChange={(event) => {
          onFiles(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ''
        }}
      />
      <Tooltip label={t.aiAttachFiles} description={t.aiAttachmentHint}>
        <Button
          className="ai-attachment-add"
          variant="ghost"
          size="compact"
          disabled={disabled}
          aria-label={t.aiAttachFiles}
          onClick={() => inputRef.current?.click()}
        >
          <AppIcon name="ai-attach" size={18} />
        </Button>
      </Tooltip>
    </>
  )
}

export function AiPendingAttachments({
  attachments,
  disabled,
  onRemove
}: {
  attachments: PendingAiAttachment[]
  disabled: boolean
  onRemove(id: string): void
}) {
  return (
    <div className="ai-attachment-list" aria-label={t.aiAttachments}>
      {attachments.map((file) => (
        <div className="ai-attachment-chip" key={file.id}>
          {file.preview ? (
            <img src={file.preview} alt="" width={32} height={32} />
          ) : (
            <AppIcon name={file.kind === 'pdf' ? 'ai-document' : 'ai-code'} size={21} />
          )}
          <Tooltip label={file.name} description={formatAttachmentSize(file.size)}>
            <span className="ai-attachment-name">
              {file.name}
              <small>{formatAttachmentSize(file.size)}</small>
            </span>
          </Tooltip>
          <Button
            variant="ghost"
            size="compact"
            disabled={disabled}
            aria-label={`${t.aiAttachmentRemove}: ${file.name}`}
            onClick={() => onRemove(file.id)}
          >
            <AppIcon name="ai-close" size={12} />
          </Button>
        </div>
      ))}
    </div>
  )
}

export function AiMessageAttachments({
  attachments,
  conversationId
}: {
  attachments: AiAttachment[]
  conversationId: string
}) {
  const [preview, setPreview] = useState<{ name: string; value: string; image: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLPreElement>(null)
  const open = async (file: AiAttachment) => {
    const api = window.transterm
    if (!api || busy || file.kind === 'pdf' || file.id.startsWith('pending-')) return
    setBusy(file.id)
    setError(null)
    try {
      const value = await api.getAiAttachmentPreview(conversationId, file.id)
      setPreview({ name: file.name, value, image: file.kind === 'image' })
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <div className="ai-attachment-list ai-message-attachments">
        {attachments.map((file) => (
          <Tooltip
            key={file.id}
            label={file.name}
            description={file.kind === 'pdf' ? t.aiAttachmentPdfHint : t.aiAttachmentPreview}
          >
            <Button
              variant="secondary"
              className="ai-attachment-history"
              disabled={!!busy || file.kind === 'pdf' || file.id.startsWith('pending-')}
              aria-busy={busy === file.id}
              onClick={() => void open(file)}
            >
              <AppIcon
                name={file.kind === 'image' ? 'ai-image' : file.kind === 'pdf' ? 'ai-document' : 'ai-code'}
                size={18}
              />
              <span>
                {file.name}
                <small>{formatAttachmentSize(file.size)}</small>
              </span>
            </Button>
          </Tooltip>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {preview ? (
        <ConfirmActionDialog
          className="ai-attachment-preview"
          title={preview.name}
          description={
            preview.image ? (
              <img src={preview.value} alt={preview.name} />
            ) : (
              <div className="ai-attachment-preview-scroll">
                <pre ref={previewRef}>{preview.value}</pre>
                <VerticalScrollbar scrollRef={previewRef} />
              </div>
            )
          }
          confirmLabel={t.closeTab}
          confirmVariant="primary"
          onClose={() => setPreview(null)}
          onConfirm={() => setPreview(null)}
        />
      ) : null}
    </>
  )
}
