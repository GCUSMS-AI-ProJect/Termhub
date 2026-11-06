import type { AiAttachmentUpload } from '@transterm/core'

export const AI_ATTACHMENT_MAX_FILES = 8
export const AI_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const AI_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024

export interface PendingAiAttachment {
  id: string
  name: string
  size: number
  kind: 'text' | 'image' | 'pdf'
  preview?: string
  upload: AiAttachmentUpload
}

export function formatAttachmentSize(size: number) {
  return size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${Math.ceil(size / 1024)} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export async function readAiAttachment(file: File): Promise<PendingAiAttachment> {
  if (!file.size || file.size > AI_ATTACHMENT_MAX_BYTES) throw new Error(`${file.name}: 1 B – 5 MB`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const image =
    (bytes[0] === 0x89 && bytes[1] === 0x50) ||
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    new TextDecoder().decode(bytes.slice(0, 4)) === 'GIF8' ||
    (new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP')
  const pdf = new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  if (!image && !pdf) {
    if (file.size > 128 * 1024) throw new Error(`${file.name}: UTF-8 ≤ 128 KB`)
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (text.includes('\0')) throw new Error(`${file.name}: UTF-8 / PNG / JPEG / GIF / WebP / PDF`)
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const data = btoa(binary)
  const mime =
    bytes[0] === 0x89
      ? 'image/png'
      : bytes[0] === 0xff
        ? 'image/jpeg'
        : new TextDecoder().decode(bytes.slice(0, 4)) === 'GIF8'
          ? 'image/gif'
          : 'image/webp'
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    kind: image ? 'image' : pdf ? 'pdf' : 'text',
    preview: image ? `data:${mime};base64,${data}` : undefined,
    upload: { name: file.name, data }
  }
}

export function validateAttachmentSelection(existing: { size: number }[], incoming: { size: number }[]) {
  return (
    existing.length + incoming.length <= AI_ATTACHMENT_MAX_FILES &&
    [...existing, ...incoming].reduce((total, file) => total + file.size, 0) <= AI_ATTACHMENT_TOTAL_BYTES
  )
}
