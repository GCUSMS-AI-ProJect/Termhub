import type { useAiWorkspaces } from './use-ai-workspaces'
import type { useAiWorkspaceActions } from './use-ai-workspace-actions'
import { AiWorkspaceSelector } from './ai-workspace-selector'
import { Button } from '../../components/common/button/button'
import { Tooltip } from '../../components/common/tooltip/tooltip'
import { AppIcon } from '../common/app-icon'
import { t } from '../../i18n'

export function AiWorkspaceControls({
  project,
  actions,
  disabled,
  onSelect
}: {
  project: ReturnType<typeof useAiWorkspaces>
  actions: ReturnType<typeof useAiWorkspaceActions>
  disabled: boolean
  onSelect(id: string | null): void
}) {
  return (
    <>
      <AiWorkspaceSelector
        workspaces={project.workspaces}
        selectedId={project.selectedId}
        disabled={disabled || project.busy}
        canAddRemote={actions.canAddRemote}
        onSelect={onSelect}
        onAddLocal={actions.addLocal}
        onAddRemote={actions.addRemote}
      />
      {project.selected ? (
        <div className="ai-workspace-location">
          <Tooltip label={project.selected.path} description={project.selected.host ?? t.aiWorkspaceLocal}>
            <span className="ai-workspace-path">{project.selected.path}</span>
          </Tooltip>
          <Tooltip label={t.aiWorkspaceRemove}>
            <Button
              variant="ghost"
              size="compact"
              disabled={disabled || project.busy}
              aria-label={t.aiWorkspaceRemove}
              onClick={() => {
                if (project.selected) actions.remove(project.selected)
              }}
            >
              <AppIcon name="ai-trash" size={14} />
            </Button>
          </Tooltip>
        </div>
      ) : null}
      {project.error ? (
        <p className="ai-attachment-error" role="alert">
          {project.error}
        </p>
      ) : null}
    </>
  )
}
