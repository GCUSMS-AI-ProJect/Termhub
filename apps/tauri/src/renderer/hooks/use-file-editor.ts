import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  FileContentSnapshot,
  FileEditorWindowInput,
  TranstermDesktopApi,
  LocalFileItem,
  RemoteFileItem,
  WorkspaceSnapshot
} from '@transterm/core'
import type { AppLocale } from '../i18n'

const TEXT_EDITOR_MAX_BYTES = 16 * 1024 * 1024
const LIKELY_BINARY_FILE_EXTENSIONS = new Set([
  '.7z',
  '.a',
  '.apk',
  '.bin',
  '.bz2',
  '.class',
  '.db',
  '.dll',
  '.dmg',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.img',
  '.iso',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.o',
  '.otf',
  '.pdf',
  '.png',
  '.pyc',
  '.rar',
  '.so',
  '.tar',
  '.tgz',
  '.ttf',
  '.war',
  '.webp',
  '.xz',
  '.zip'
])

type FileEditorErrorDetails = {
  item?: RemoteFileItem
  targetPath?: string
}

type UseFileEditorOptions = {
  activeTabId: string | null
  desktopApi?: TranstermDesktopApi
  formatError(scope: string, error: unknown, details?: FileEditorErrorDetails): string
  isFileEditorWindow: boolean
  onApplySnapshot(snapshot: WorkspaceSnapshot): void
  onLocalFileSaved?(): Promise<void>
  onStatusMessage(message: string): void
  windowInput: FileEditorWindowInput | null
}

function parseApproximateFileSize(size: string): number | null {
  if (!size || size === '-') {
    return null
  }

  const match = size.trim().match(/^([\d.]+)\s*([A-Za-z]+)$/)
  if (!match) {
    return null
  }

  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount)) {
    return null
  }

  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  }

  return Math.round(amount * (units[match[2].toUpperCase()] ?? 1))
}

function isLikelyBinaryFile(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.tar.gz')) {
    return true
  }

  const dotIndex = lowerName.lastIndexOf('.')
  return dotIndex >= 0 && LIKELY_BINARY_FILE_EXTENSIONS.has(lowerName.slice(dotIndex))
}

export function getRemoteFileEditorBlockReason(item: RemoteFileItem, locale: AppLocale): string | null {
  if (item.type !== 'file') {
    return null
  }

  if (isLikelyBinaryFile(item.name)) {
    return locale === 'zhCN'
      ? '这个文件看起来像二进制/镜像文件，不适合直接在文本编辑器里打开。建议先下载后用专用工具处理。'
      : 'This file looks like a binary or disk image, so it is not suitable for the text editor. Download it and open it with a dedicated tool instead.'
  }

  const approximateSize = parseApproximateFileSize(item.size)
  if (approximateSize !== null && approximateSize > TEXT_EDITOR_MAX_BYTES) {
    const maxSizeLabel = `${Math.round(TEXT_EDITOR_MAX_BYTES / (1024 * 1024))} MB`
    return locale === 'zhCN'
      ? `这个文件约为 ${item.size}，超过内置文本编辑器建议上限 ${maxSizeLabel}。为避免卡住文件面板，请先下载后再编辑。`
      : `This file is about ${item.size}, which exceeds the built-in editor recommendation of ${maxSizeLabel}. Download it first to avoid freezing the file pane.`
  }

  return null
}

function createInitialFile(
  isFileEditorWindow: boolean,
  input: FileEditorWindowInput | null
): FileContentSnapshot | null {
  if (!isFileEditorWindow || !input || (input.source === 'remote' && !input.tabId)) {
    return null
  }

  return {
    ...input,
    encoding: input.encoding ?? 'utf-8',
    content: ''
  }
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export function useFileEditor({
  activeTabId,
  desktopApi,
  formatError,
  isFileEditorWindow,
  onLocalFileSaved,
  onStatusMessage,
  windowInput
}: UseFileEditorOptions) {
  const [file, setFile] = useState<FileContentSnapshot | null>(() => createInitialFile(isFileEditorWindow, windowInput))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)
  const [isDirty, setIsDirty] = useState(false)
  const formatErrorRef = useLatestRef(formatError)
  const onLocalFileSavedRef = useLatestRef(onLocalFileSaved)
  const onStatusMessageRef = useLatestRef(onStatusMessage)

  useEffect(() => {
    if (!desktopApi || !isFileEditorWindow || !windowInput) {
      return
    }

    if (windowInput.source === 'remote' && !windowInput.tabId) {
      setErrorMessage(
        formatErrorRef.current('打开文件编辑器', new Error('远程文件编辑器缺少会话标识，已阻止读取和保存'))
      )
      setIsLoading(false)
      return
    }

    let canceled = false

    void (async () => {
      try {
        setIsLoading(true)
        const encoding = windowInput.encoding ?? 'utf-8'
        const snapshot = await desktopApi.readVersionedFile({ ...windowInput, encoding })

        if (canceled) {
          return
        }

        setFile({
          ...windowInput,
          encoding,
          content: snapshot.content,
          revision: snapshot.revision,
          binding: snapshot.binding
        })
        setErrorMessage(null)
        setIsDirty(false)
      } catch (error) {
        if (!canceled) {
          console.error('[transterm] 打开文件编辑器', error)
          setErrorMessage(formatErrorRef.current('打开文件编辑器', error))
        }
      } finally {
        if (!canceled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      canceled = true
    }
  }, [
    desktopApi,
    isFileEditorWindow,
    windowInput?.encoding,
    windowInput?.name,
    windowInput?.path,
    windowInput?.source,
    windowInput?.tabId
  ])

  const openLocalFile = useCallback(
    async (item: LocalFileItem) => {
      if (!desktopApi) {
        return
      }

      await desktopApi.openFileEditorWindow({
        source: 'local',
        path: item.path,
        name: item.name,
        encoding: 'utf-8'
      })
    },
    [desktopApi]
  )

  const openRemoteFile = useCallback(
    async (tabId: string, item: RemoteFileItem, locale: AppLocale) => {
      if (!desktopApi) {
        return
      }

      const blockReason = getRemoteFileEditorBlockReason(item, locale)
      if (blockReason) {
        onStatusMessageRef.current(blockReason)
        return
      }

      await desktopApi.openFileEditorWindow({
        source: 'remote',
        path: item.path,
        name: item.name,
        tabId,
        encoding: 'utf-8'
      })
    },
    [desktopApi]
  )

  const save = useCallback(
    async (content: string, encoding: string, resolution?: 'replace-external') => {
      if (!desktopApi || !file) {
        return
      }
      if (savingRef.current) {
        return
      }

      try {
        savingRef.current = true
        setIsSaving(true)
        const tabId = isFileEditorWindow ? file.tabId : (file.tabId ?? activeTabId ?? undefined)
        const baseline = resolution === 'replace-external' ? file.conflict : file
        if (!baseline?.revision || !baseline.binding) throw new Error('请重新读取文件后再保存')
        const result = await desktopApi.saveFileChange({
          target: { source: file.source, path: file.path, tabId, encoding: file.encoding },
          expectedRevision: baseline.revision,
          expectedBinding: baseline.binding,
          content,
          encoding
        })
        if (file.source === 'local' && !isFileEditorWindow) await onLocalFileSavedRef.current?.()
        setFile((current) =>
          current
            ? {
                ...current,
                content: result.file.content,
                encoding,
                revision: result.file.revision,
                binding: result.file.binding,
                changeId: result.changeId,
                conflict: undefined
              }
            : current
        )
        setErrorMessage(null)
        setIsDirty(false)
      } catch (error) {
        if (String(error).includes('FILE_CONFLICT')) {
          try {
            const latest = await desktopApi.readVersionedFile({
              source: file.source,
              path: file.path,
              tabId: file.tabId ?? activeTabId ?? undefined,
              encoding: file.encoding
            })
            setFile((current) => (current ? { ...current, conflict: latest } : current))
          } catch {
            /* Keep the edited buffer when the remote file is no longer readable. */
          }
        }
        console.error('[transterm] 保存文件', error)
        setErrorMessage(formatErrorRef.current('保存文件', error, { targetPath: file.path }))
      } finally {
        savingRef.current = false
        setIsSaving(false)
      }
    },
    [activeTabId, desktopApi, file, isFileEditorWindow]
  )

  const reloadWithEncoding = useCallback(
    async (encoding: string) => {
      if (!desktopApi || !file) {
        return
      }

      try {
        setIsLoading(true)
        const tabId = isFileEditorWindow ? file.tabId : (file.tabId ?? activeTabId)
        if (file.source === 'remote' && !tabId) {
          throw new Error('远程文件编辑器缺少会话标识，已阻止重新读取')
        }
        const snapshot = await desktopApi.readVersionedFile({
          source: file.source,
          path: file.path,
          tabId: tabId ?? undefined,
          encoding
        })
        setFile({
          ...file,
          content: snapshot.content,
          encoding,
          revision: snapshot.revision,
          binding: snapshot.binding,
          conflict: undefined,
          changeId: undefined
        })
        setErrorMessage(null)
        setIsDirty(false)
      } catch (error) {
        console.error('[transterm] 重新按编码打开文件', error)
        setErrorMessage(formatErrorRef.current('重新按编码打开文件', error))
      } finally {
        setIsLoading(false)
      }
    },
    [activeTabId, desktopApi, file, isFileEditorWindow]
  )

  const close = useCallback(() => {
    setFile(null)
    setErrorMessage(null)
    setIsDirty(false)
  }, [])

  const checkDirty = useCallback(
    (content: string, encoding: string) => {
      setIsDirty(Boolean(file && (content !== file.content || encoding !== (file.encoding ?? 'utf-8'))))
    },
    [file]
  )

  return {
    checkDirty,
    close,
    errorMessage,
    file,
    isBusy: isLoading || isSaving,
    isDirty,
    isLoading,
    isSaving,
    openLocalFile,
    openRemoteFile,
    reloadWithEncoding,
    save,
    setErrorMessage,
    setFile
  }
}
