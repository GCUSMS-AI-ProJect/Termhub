import { useEffect, useRef, useState } from 'react'
import type { SshCredentialsInput, SshCredentialsPromptRequest } from '@transterm/core'
import { AppIcon } from '../common/app-icon'
import { CloseButton } from '../common/close-button'
import { DropdownSelect } from '../common/dropdown-select'
import { StableButtonContent } from '../common/stable-button-content'
import { VerticalScrollbar } from '../common/vertical-scrollbar'
import { t } from '../../i18n'
import { ConnectionSecretField } from './connection-secret-field'
import { SshPrivateKeyField } from './ssh-private-key-field'
import { sshInteractionConnectionLabel } from './ssh-interaction-labels'
import './ssh-credentials-modal.css'

export function SshCredentialsModal({
  errorMessage,
  isSubmitting = false,
  request,
  onCancel,
  onSubmit
}: {
  errorMessage?: string | null
  isSubmitting?: boolean
  request: SshCredentialsPromptRequest
  onCancel(): void
  onSubmit(input: SshCredentialsInput): void
}) {
  const [username, setUsername] = useState(request.username ?? '')
  const [password, setPassword] = useState('')
  const [authType, setAuthType] = useState<'password' | 'privateKey'>('password')
  const [privateKeyId, setPrivateKeyId] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setUsername(request.username ?? '')
    setPassword('')
    setAuthType('password')
    setPrivateKeyId('')
  }, [request])

  const submit = () => {
    if (isSubmitting) return
    onSubmit(authType === 'privateKey' ? { username, authType, privateKeyId } : { username, authType, password })
  }

  return (
    <div className="modal-backdrop">
      <form
        aria-labelledby="ssh-login-title"
        aria-modal="true"
        className="modal-card root-access-modal ssh-credentials-modal"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        role="dialog"
      >
        <div className="root-access-modal__header">
          <span className="root-access-modal__title" id="ssh-login-title">
            <AppIcon name="server" size={16} />
            <span>{t.sshAuthPromptTitle}</span>
          </span>
          <CloseButton className="root-access-modal__close" disabled={isSubmitting} onClick={onCancel} />
        </div>

        <div className="ssh-credentials-modal__scroll-region">
          <div className="root-access-modal__body" ref={scrollRef}>
            <fieldset className="ssh-fieldset root-access-fieldset">
              <legend>{t.general}</legend>
              <div className="root-access-description">{t.sshAuthPromptDescription}</div>
              <div className="root-access-meta">
                <span>{t.sshKeyboardInteractiveConnection}</span>
                <strong>{sshInteractionConnectionLabel(request.authenticationTarget, request.connectionName)}</strong>
              </div>
              <div className="root-access-meta">
                <span>{t.host}</span>
                <strong>{`${request.host}:${request.port}`}</strong>
              </div>
            </fieldset>

            <fieldset className="ssh-fieldset root-access-fieldset" disabled={isSubmitting}>
              <legend>{t.auth}</legend>
              <div className="ssh-grid">
                {request.authType !== 'kubernetes' ? (
                  <div className="ssh-form-field span-2">
                    <div className="ssh-form-field__header">
                      <label htmlFor="ssh-login-method">{t.method}:</label>
                    </div>
                    <DropdownSelect
                      id="ssh-login-method"
                      value={authType}
                      options={[
                        { value: 'password', label: t.password },
                        { value: 'privateKey', label: t.privateKey }
                      ]}
                      onChange={(value) => setAuthType(value as 'password' | 'privateKey')}
                    />
                  </div>
                ) : null}
                <div className="ssh-form-field span-2">
                  <div className="ssh-form-field__header">
                    <label htmlFor="ssh-login-username">{t.sshAuthPromptUsername}:</label>
                  </div>
                  <input
                    autoComplete="username"
                    autoFocus
                    id="ssh-login-username"
                    spellCheck={false}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                {authType === 'privateKey' ? (
                  <SshPrivateKeyField privateKeyId={privateKeyId} onChange={setPrivateKeyId} />
                ) : (
                  <ConnectionSecretField
                    canClear={false}
                    fullWidth
                    hasSavedValue={false}
                    id="ssh-login-password"
                    label={t.password}
                    value={password}
                    onChange={setPassword}
                    onClear={() => setPassword('')}
                    onUndo={() => setPassword('')}
                  />
                )}
              </div>
            </fieldset>
            {errorMessage ? (
              <div className="modal-error" role="alert">
                {errorMessage}
              </div>
            ) : null}
          </div>
          <VerticalScrollbar scrollRef={scrollRef} />
        </div>

        <div className="form-actions root-access-modal__actions">
          <button className="flat-button" disabled={isSubmitting} onClick={onCancel} type="button">
            {t.cancel}
          </button>
          <button
            aria-busy={isSubmitting}
            className="primary-button file-action-submit-button"
            disabled={isSubmitting}
            type="submit"
          >
            <StableButtonContent busy={isSubmitting} label={t.sshAuthPromptConfirm} />
          </button>
        </div>
      </form>
    </div>
  )
}
