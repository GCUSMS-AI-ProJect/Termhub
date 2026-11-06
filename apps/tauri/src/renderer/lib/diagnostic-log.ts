import type { TranstermDesktopApi } from '@transterm/core'

export type DiagnosticLogLevel = Parameters<TranstermDesktopApi['writeDiagnosticLog']>[0]

export const DIAGNOSTIC_SCOPES = {
  workspace: 'renderer:workspace',
  monitoring: 'renderer:monitoring',
  performance: 'renderer:performance',
  error: 'renderer:error',
  clipboard: 'renderer:clipboard'
} as const

export type DiagnosticScope = (typeof DIAGNOSTIC_SCOPES)[keyof typeof DIAGNOSTIC_SCOPES]

/** Local app.log diagnostics; failures must never interrupt a UI action or event. */
export function writeDiagnosticLog(
  level: DiagnosticLogLevel,
  scope: DiagnosticScope,
  message: string,
  api: TranstermDesktopApi | undefined = window.transterm
): void {
  try {
    void api?.writeDiagnosticLog(level, scope, message).catch(() => undefined)
  } catch {
    // A missing/stale bridge is not a reason to fail the operation being diagnosed.
  }
}
