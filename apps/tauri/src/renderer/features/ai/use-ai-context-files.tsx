import { useEffect, useRef, useState } from 'react'
import type { AiWorkspace, SessionSnapshot, WorkspaceTab } from '@transterm/core'
import { AiFileReferenceDialog } from './ai-file-reference-dialog'
import { consumeAiFileReference, type AiFileReferenceInput } from './ai-file-reference-events'

export function useAiContextFiles({
  workspace,
  activeTab,
  activeSession,
  disabled,
  onAdd
}: {
  workspace: AiWorkspace | null
  activeTab: WorkspaceTab | null
  activeSession: SessionSnapshot | null
  disabled: boolean
  onAdd(files: File[]): void
}) {
  const [open, setOpen] = useState(false)
  const [initial, setInitial] = useState<AiFileReferenceInput | null>(null)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  useEffect(() => {
    const receive = () => {
      if (disabledRef.current) return
      const input = consumeAiFileReference()
      if (input) {
        setInitial(input)
        setOpen(true)
      }
    }
    receive()
    window.addEventListener('transterm:ai-reference-file', receive)
    return () => window.removeEventListener('transterm:ai-reference-file', receive)
  }, [])
  useEffect(() => {
    if (!disabled) {
      const input = consumeAiFileReference()
      if (input) {
        setInitial(input)
        setOpen(true)
      }
    }
  }, [disabled])
  return {
    open: () => {
      if (!disabled) {
        setInitial(null)
        setOpen(true)
      }
    },
    dialog: open ? (
      <AiFileReferenceDialog
        initial={initial}
        workspace={workspace}
        activeTab={activeTab}
        activeSession={activeSession}
        onClose={() => setOpen(false)}
        onAdd={onAdd}
      />
    ) : null
  }
}
