import type {
  AiContextPreview,
  AiContextTarget,
  AiCopilotModeState,
  CreateAiContextPreviewInput
} from '@transterm/core'

export interface AiSshBinding {
  tabId: string
  rootTabId: string
  providerId: string
  sessionRevision: string
}

function sameBinding(a: AiSshBinding, b: AiSshBinding | null) {
  return (
    b !== null &&
    a.tabId === b.tabId &&
    a.rootTabId === b.rootTabId &&
    a.providerId === b.providerId &&
    a.sessionRevision === b.sessionRevision
  )
}

/** Verify the current SSH target before granting the existing tool mode. */
export async function connectAiToCurrentSsh({
  getBinding,
  createPreview,
  setMode,
  targetChangedMessage
}: {
  getBinding(): AiSshBinding | null
  createPreview(input: CreateAiContextPreviewInput): Promise<AiContextPreview | null>
  setMode(mode: 'pure-conversation' | 'semi-automatic'): Promise<AiCopilotModeState | null>
  targetChangedMessage: string
}): Promise<AiContextTarget | null> {
  const binding = getBinding()
  if (!binding) throw new Error(targetChangedMessage)
  const preview = await createPreview({
    tabId: binding.tabId,
    rootTabId: binding.rootTabId,
    providerId: binding.providerId,
    mode: 'L2'
  })
  if (!preview) return null
  if (
    !sameBinding(binding, getBinding()) ||
    preview.target.tabId !== binding.tabId ||
    preview.target.rootTabId !== binding.rootTabId ||
    preview.target.sessionRevision !== binding.sessionRevision ||
    preview.target.sessionType !== 'ssh' ||
    !preview.target.connected
  ) {
    throw new Error(targetChangedMessage)
  }
  const state = await setMode('semi-automatic')
  if (!state) return null
  if (!sameBinding(binding, getBinding())) {
    await setMode('pure-conversation')
    throw new Error(targetChangedMessage)
  }
  return preview.target
}
