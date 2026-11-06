export interface AiFileReferenceInput {
  tabId?: string
  path: string
  kind: 'local' | 'ssh'
  name?: string
}
let pending: AiFileReferenceInput | null = null
export function requestAiFileReference(input: AiFileReferenceInput) {
  pending = input
  window.dispatchEvent(new CustomEvent('transterm:ai-reference-file', { detail: input }))
}
export function consumeAiFileReference() {
  const input = pending
  pending = null
  return input
}
