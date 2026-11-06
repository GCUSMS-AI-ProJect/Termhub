import type { AiProviderSummary } from '@transterm/core'
import { t } from '../../i18n'
import { DropdownSelect } from '../common/dropdown-select'
import { AppIcon } from '../common/app-icon'

// A single selection keeps the provider and its model together when switching.
export function AiModelPicker({
  providers,
  providerId,
  model,
  disabled,
  onSelect
}: {
  providers: AiProviderSummary[]
  providerId: string | null
  model: string
  disabled: boolean
  onSelect(providerId: string, model: string): void
}) {
  const models = providers.flatMap((provider) =>
    [...new Set([provider.model, ...(provider.models ?? [])].filter(Boolean))].map((id) => ({
      value: JSON.stringify([provider.id, id]),
      label: `${id} · ${provider.name}`,
      model: id,
      provider
    }))
  )
  return (
    <DropdownSelect
      ariaLabel={`${t.aiCopilotChooseModel} · ${providers.find((provider) => provider.id === providerId)?.name ?? ''} · ${model}`}
      className="ai-copilot-composer-select ai-copilot-model-picker"
      disabled={disabled}
      forceCustomMenu
      menuClassName="ai-copilot-toolbar-menu ai-model-picker-menu"
      menuPlacement="above"
      menuWidth="auto"
      options={models}
      value={JSON.stringify([providerId, model])}
      renderOption={(option, selected) => {
        const item = models.find((candidate) => candidate.value === option.value)!
        return (
          <span className="ai-model-picker-option">
            <span>
              <strong>{item.model}</strong>
              <small>{item.provider.name}</small>
            </span>
            {selected ? <AppIcon name="ai-check" size={14} /> : null}
          </span>
        )
      }}
      renderValue={(option) => {
        const item = models.find((candidate) => candidate.value === option.value)!
        return <span title={option.label}>{item.model}</span>
      }}
      onChange={(value) => {
        const item = models.find((candidate) => candidate.value === value)
        if (item) onSelect(item.provider.id, item.model)
      }}
    />
  )
}
