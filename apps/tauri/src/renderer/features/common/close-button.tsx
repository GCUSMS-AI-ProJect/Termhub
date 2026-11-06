import type { ButtonHTMLAttributes } from 'react'
import { t } from '../../i18n'
import { AppIcon, type AppIconName } from './app-icon'

type CloseButtonSize = 'compact' | 'default' | 'tab' | 'window'

export function CloseButton({
  'aria-label': ariaLabel = t.closeTab,
  className,
  iconStrokeWidth,
  iconName = 'close',
  size = 'default',
  title,
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> & {
  iconStrokeWidth?: number
  iconName?: AppIconName
  size?: CloseButtonSize
}) {
  const resolvedClassName = ['app-close-button', `app-close-button--${size}`, className].filter(Boolean).join(' ')

  return (
    <button
      {...buttonProps}
      aria-label={ariaLabel}
      className={resolvedClassName}
      title={title ?? ariaLabel}
      type="button"
    >
      <AppIcon
        name={iconName}
        size={size === 'default' ? 16 : size === 'compact' ? 14 : 12}
        strokeWidth={iconStrokeWidth}
      />
    </button>
  )
}
