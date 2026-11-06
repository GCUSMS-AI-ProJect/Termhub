import type { RemoteFileItem } from '@transterm/core'
import { Button } from '../../components/common/button/button'
import { Tooltip } from '../../components/common/tooltip/tooltip'
import { t } from '../../i18n'
import { AppIcon } from '../common/app-icon'
import './directory-navigation-buttons.css'

export function DirectoryNavigationButtons({
  label,
  items,
  selectedPaths,
  currentPath,
  disabled = false,
  loading = false,
  onOpenItem
}: {
  label: string
  items: RemoteFileItem[]
  selectedPaths: string[]
  currentPath: string
  disabled?: boolean
  loading?: boolean
  onOpenItem(item: RemoteFileItem): void
}) {
  const parent = items.find((item) => item.name === '..' && item.type === 'folder' && item.path !== currentPath)
  const selectedDirectory =
    selectedPaths.length === 1
      ? items.find(
          (item) =>
            item.path === selectedPaths[0] &&
            item.type === 'folder' &&
            item.name !== '..' &&
            item.name !== '.' &&
            item.path !== currentPath
        )
      : undefined
  const unavailable = disabled || loading

  return (
    <div
      className="directory-navigation"
      role="group"
      aria-label={`${label}: ${t.directoryNavigation}`}
      aria-busy={loading}
    >
      <Tooltip label={t.goToParentDirectory} description={parent?.path}>
        <Button
          className="directory-navigation-button"
          variant="ghost"
          size="compact"
          aria-label={t.goToParentDirectory}
          disabled={unavailable || !parent}
          onClick={() => {
            if (!unavailable && parent) onOpenItem(parent)
          }}
        >
          <AppIcon name="arrow-up" size={14} />
        </Button>
      </Tooltip>
      <Tooltip label={t.enterSelectedDirectory} description={selectedDirectory?.path ?? t.selectSingleDirectoryHint}>
        <Button
          className="directory-navigation-button"
          variant="ghost"
          size="compact"
          aria-label={t.enterSelectedDirectory}
          disabled={unavailable || !selectedDirectory}
          onClick={() => {
            if (!unavailable && selectedDirectory) onOpenItem(selectedDirectory)
          }}
        >
          <AppIcon name="arrow-down" size={14} />
        </Button>
      </Tooltip>
    </div>
  )
}
