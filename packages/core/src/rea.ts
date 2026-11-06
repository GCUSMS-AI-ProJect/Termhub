/** Built-in REA checks are scoped to the current window and terminal identity. */
export interface CheckReaInput {
  tabId: string
  rootTabId: string
  requestId: string
}

export interface ReaStatus {
  ready: boolean
  version: string
  target: string
  toolCount: number
  server: { name?: string; version?: string }
  message: string
  engines: ReaEngineStatus[]
}

export interface ReaEngineStatus {
  id: string
  name: string
  status: 'available' | 'unavailable' | 'unknown'
  detail: string
}

export type ReaPreparationStage = 'checking-runtime' | 'preparing-package' | 'starting' | 'checking-engines' | 'ready'
export interface ReaPreparationProgress {
  requestId: string
  stage: ReaPreparationStage
}

export interface ReaActivation {
  enabled: boolean
  status: ReaStatus | null
}

export interface SetReaEnabledInput extends CheckReaInput {
  enabled: boolean
}
