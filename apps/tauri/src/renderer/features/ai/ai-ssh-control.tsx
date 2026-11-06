import { t, formatMessage } from '../../i18n'
import { Button } from '../../components/common/button/button'
import { Tooltip } from '../../components/common/tooltip/tooltip'
import { AppIcon } from '../common/app-icon'
import './ai-ssh-control.css'

export function AiSshControl({
  available,
  hasProvider,
  connected,
  busy,
  disabled,
  host,
  onToggle
}: {
  available: boolean
  hasProvider: boolean
  connected: boolean
  busy: boolean
  disabled: boolean
  host: string
  onToggle(): void
}) {
  const label = busy ? t.aiSshConnecting : connected ? t.aiSshDisconnect : t.aiSshConnect
  const description = !hasProvider
    ? t.aiSshProviderRequired
    : !available
      ? t.aiSshUnavailable
      : formatMessage(connected ? t.aiSshConnectedHint : t.aiSshConnectHint, { host })

  return (
    <Tooltip label={label} description={description}>
      <Button
        variant={connected ? 'primary' : 'ghost'}
        size="compact"
        className="ai-ssh-control"
        disabled={disabled || busy || !available || !hasProvider}
        aria-label={`${label}${available && host ? ` · ${host}` : ''}`}
        aria-pressed={connected}
        aria-busy={busy}
        onClick={onToggle}
      >
        {busy ? <span className="button-spinner" aria-hidden="true" /> : <AppIcon name="ai-ssh" size={18} />}
        {connected && !busy ? <AppIcon className="ai-ssh-connected-mark" name="ai-check" size={10} /> : null}
      </Button>
    </Tooltip>
  )
}
