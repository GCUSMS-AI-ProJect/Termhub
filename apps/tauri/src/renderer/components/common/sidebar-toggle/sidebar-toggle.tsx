import { Button } from '../button/button'
import './sidebar-toggle.css'

export function SidebarToggle({
  collapsed,
  label,
  className,
  onClick
}: {
  collapsed: boolean
  label: string
  /** Context class so callers and tests can distinguish multiple sidebar toggles. */
  className?: string
  onClick(): void
}) {
  return (
    <Button
      aria-label={label}
      aria-expanded={!collapsed}
      className={`sidebar-toggle ${className ?? ''}`.trim()}
      title={label}
      onClick={onClick}
      icon={<span className="sidebar-toggle-icon" aria-hidden="true" />}
    />
  )
}
