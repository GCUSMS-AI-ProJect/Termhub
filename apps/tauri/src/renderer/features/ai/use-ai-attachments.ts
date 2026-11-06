import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import type { AiAttachmentUpload } from '@transterm/core'
import { readAiAttachment, validateAttachmentSelection, type PendingAiAttachment } from './ai-attachment-utils'

export function useAiAttachments() {
  const [attachments, setAttachments] = useState<PendingAiAttachment[]>([])
  const [isReading, setIsReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filesRef = useRef<PendingAiAttachment[]>([])
  const readingRef = useRef(false)
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current++
    }
  }, [])
  const addFiles = async (files: File[]) => {
    if (readingRef.current || !files.length) return
    if (!validateAttachmentSelection(filesRef.current, files)) {
      setError(t.aiAttachmentLimit)
      return
    }
    readingRef.current = true
    setIsReading(true)
    setError(null)
    const current = generation.current
    try {
      const next = await Promise.all(files.map(readAiAttachment))
      if (current !== generation.current) return
      filesRef.current = [...filesRef.current, ...next]
      setAttachments(filesRef.current)
    } catch (error) {
      if (current === generation.current)
        setError(`${t.aiAttachmentFailed}: ${String(error instanceof Error ? error.message : error)}`)
    } finally {
      readingRef.current = false
      if (mounted.current) setIsReading(false)
    }
  }
  const clear = () => {
    generation.current++
    filesRef.current = []
    setAttachments([])
    setError(null)
  }
  const remove = (id: string) => {
    filesRef.current = filesRef.current.filter((file) => file.id !== id)
    setAttachments(filesRef.current)
  }
  const addPaths = async (paths: string[]) => {
    const api = window.transterm
    if (!api || readingRef.current || !paths.length) return
    readingRef.current = true
    setIsReading(true)
    setError(null)
    const current = generation.current
    try {
      const uploads = await api.readAiAttachmentFiles(paths)
      if (current !== generation.current) return
      const files = uploads.map((upload) => {
        const binary = atob(upload.data)
        return new File([Uint8Array.from(binary, (c) => c.charCodeAt(0))], upload.name)
      })
      if (!validateAttachmentSelection(filesRef.current, files)) throw new Error(t.aiAttachmentLimit)
      const next = await Promise.all(files.map(readAiAttachment))
      if (current !== generation.current) return
      filesRef.current = [...filesRef.current, ...next]
      setAttachments(filesRef.current)
    } catch (error) {
      if (current === generation.current) setError(String(error))
    } finally {
      readingRef.current = false
      if (mounted.current) setIsReading(false)
    }
  }
  const replaceUploads = async (uploads: AiAttachmentUpload[]) => {
    const current = ++generation.current
    const next = await Promise.all(
      uploads.map(async (upload) => {
        const bytes = Uint8Array.from(atob(upload.data), (c) => c.charCodeAt(0))
        return readAiAttachment(new File([bytes], upload.name))
      })
    )
    if (current !== generation.current || !mounted.current) return
    filesRef.current = next
    setAttachments(next)
    setError(null)
  }
  return { attachments, isReading, error, addFiles, addPaths, clear, remove, replaceUploads }
}
