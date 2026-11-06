import { SidebarToggle } from '../../components/common/sidebar-toggle/sidebar-toggle'
import { DEFAULT_SIDEBAR_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '../../app/app-shell-utils'
import { t } from '../../i18n'
import { HostGroupList } from './host-group-list'
import type { HostNavigation } from './use-host-navigation'

export function HostRail({
  navigation,
  collapsed,
  width,
  isResizing,
  onToggleCollapsed,
  onResizeStart,
  onWidthChange
}: {
  navigation: HostNavigation
  collapsed: boolean
  width: number
  isResizing: boolean
  onToggleCollapsed(): void
  onResizeStart(): void
  onWidthChange(width: number): void
}) {
  return (
    <aside aria-label={t.hostRailTitle} className={`fs-host-rail ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="fs-host-rail-header">
        {!collapsed ? <h2 className="fs-host-rail-title">{t.hostRailTitle}</h2> : null}
        <SidebarToggle
          className="host-rail-toggle"
          collapsed={collapsed}
          label={collapsed ? t.showHostRail : t.hideHostRail}
          onClick={onToggleCollapsed}
        />
      </div>
      <HostGroupList navigation={navigation} collapsed={collapsed} />
      {!collapsed ? (
        <div
          aria-label={t.resizeSidebar}
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={width}
          className={`sidebar-resizer ${isResizing ? 'is-active' : ''}`}
          role="separator"
          tabIndex={0}
          onDoubleClick={() => onWidthChange(DEFAULT_SIDEBAR_WIDTH)}
          onMouseDown={(event) => {
            event.preventDefault()
            onResizeStart()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Home') onWidthChange(DEFAULT_SIDEBAR_WIDTH)
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              onWidthChange(
                Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width + (event.key === 'ArrowLeft' ? -10 : 10)))
              )
            } else return
            event.preventDefault()
          }}
        />
      ) : null}
    </aside>
  )
}
