import type { AiWorkspace } from '@transterm/core'
import { t } from '../../i18n'
import { Button } from '../../components/common/button/button'
import { Tooltip } from '../../components/common/tooltip/tooltip'
import { DropdownSelect } from '../common/dropdown-select'
import { AppIcon } from '../common/app-icon'

export function AiWorkspaceSelector({
  workspaces,
  selectedId,
  disabled,
  onSelect,
  onAddLocal,
  onAddRemote,
  canAddRemote
}: {
  workspaces: AiWorkspace[]
  selectedId: string | null
  disabled: boolean
  canAddRemote: boolean
  onSelect(id: string | null): void
  onAddLocal(): void
  onAddRemote(): void
}) {
  return (
    <div className="ai-workspace-selector">
      <AppIcon name="ai-folder" size={14} />
      <DropdownSelect
        ariaLabel={t.aiWorkspace}
        className="ai-workspace-select"
        forceCustomMenu
        options={[
          { value: '', label: t.aiWorkspaceNone },
          ...workspaces.map((item) => ({
            value: item.id,
            label: `${item.name}${item.kind === 'ssh' ? ` · ${item.host}` : ''}`
          }))
        ]}
        value={selectedId ?? ''}
        onChange={(value) => onSelect(value || null)}
        disabled={disabled}
      />
      <Tooltip label={t.aiWorkspaceAddLocal}>
        <Button
          variant="ghost"
          size="compact"
          aria-label={t.aiWorkspaceAddLocal}
          disabled={disabled}
          onClick={onAddLocal}
        >
          <AppIcon name="ai-plus" size={14} />
        </Button>
      </Tooltip>
      <Tooltip label={t.aiWorkspaceAddRemote} description={!canAddRemote ? t.aiSshUnavailable : undefined}>
        <Button
          variant="ghost"
          size="compact"
          aria-label={t.aiWorkspaceAddRemote}
          disabled={disabled || !canAddRemote}
          onClick={onAddRemote}
        >
          <AppIcon name="ai-server" size={14} />
        </Button>
      </Tooltip>
    </div>
  )
}
