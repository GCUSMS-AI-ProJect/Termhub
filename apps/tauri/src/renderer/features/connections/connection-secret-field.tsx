import { useEffect, useState } from 'react'
import { t } from '../../i18n'
import { AppIcon } from '../common/app-icon'

export function ConnectionSecretField({
  id,
  label,
  value,
  hasSavedValue,
  canClear,
  fullWidth = false,
  optional = false,
  disabled = false,
  onChange,
  onClear,
  onUndo
}: {
  id: string
  label: string
  value: string | null | undefined
  hasSavedValue: boolean
  canClear: boolean
  fullWidth?: boolean
  optional?: boolean
  disabled?: boolean
  onChange(value: string): void
  onClear(): void
  onUndo(): void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const markedForClear = value === null
  const showClearButton = canClear && hasSavedValue && !markedForClear

  useEffect(() => {
    if (!value || disabled) setIsVisible(false)
  }, [disabled, value])

  return (
    <div className={`ssh-secret-field${fullWidth ? ' span-2' : ''}`}>
      <div className="ssh-secret-field__header">
        <label htmlFor={id}>
          {label}
          {optional ? <span className="ssh-secret-field__optional">{t.optionalField}</span> : null}:
        </label>
        {showClearButton ? (
          <button className="ssh-secret-field__clear" type="button" onClick={onClear} title={t.clearSavedPassword}>
            <AppIcon name="trash" size={13} />
            {t.clearSavedPassword}
          </button>
        ) : markedForClear ? (
          <span className="ssh-secret-field__cleared">
            {t.passwordMarkedForClear}
            <button className="ssh-secret-field__undo" type="button" onClick={onUndo}>
              {t.undoClearSavedPassword}
            </button>
          </span>
        ) : null}
      </div>
      <div className="ssh-secret-field__input-wrap">
        <input
          id={id}
          autoComplete="new-password"
          disabled={disabled || markedForClear}
          placeholder={
            markedForClear
              ? t.passwordMarkedForClear
              : hasSavedValue
                ? t.passwordReplacePlaceholder
                : t.passwordPlaceholder
          }
          type={isVisible ? 'text' : 'password'}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          aria-label={isVisible ? t.hidePassword : t.showPassword}
          aria-pressed={isVisible}
          className="ssh-secret-field__toggle"
          disabled={disabled || markedForClear}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsVisible((visible) => !visible)}
          title={isVisible ? t.hidePassword : t.showPassword}
          type="button"
        >
          <AppIcon name={isVisible ? 'eye-off' : 'eye'} size={15} />
        </button>
      </div>
    </div>
  )
}
