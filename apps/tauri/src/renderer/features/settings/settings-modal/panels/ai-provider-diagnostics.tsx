import type { AiProviderProbeKind, AiProviderProbeResult } from '@transterm/core'
import { Button } from '../../../../components/common/button/button'
import { AppIcon } from '../../../common/app-icon'
import { t } from '../../../../i18n'

export function AiProviderDiagnostics({
  results,
  disabled,
  busy,
  onTest
}: {
  results: AiProviderProbeResult[]
  disabled: boolean
  busy: boolean
  onTest(): void
}) {
  const labels: Record<AiProviderProbeKind, string> = {
    connection: t.aiSettingsProbeConnection,
    streaming: t.aiSettingsProbeStreaming,
    tools: t.aiSettingsProbeTools,
    image: t.aiSettingsProbeImage
  }
  return (
    <div className="ai-provider-diagnostics">
      <div className="ai-provider-diagnostics-heading">
        <p>{t.aiSettingsCapabilityTestHint}</p>
        <Button size="compact" variant="secondary" disabled={disabled} loading={busy} onClick={onTest}>
          <AppIcon name="ai-auto" size={14} />
          {t.aiSettingsCapabilityTest}
        </Button>
      </div>
      {results.length ? (
        <ul aria-live="polite">
          {results.map((result) => (
            <li key={result.check} data-status={result.status}>
              <AppIcon name={result.status === 'passed' ? 'ai-check' : 'ai-close'} size={14} />
              <strong>{labels[result.check]}</strong>
              <span>{result.durationMs} ms</span>
              <p>{result.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
