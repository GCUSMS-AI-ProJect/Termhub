import { AppIcon } from '../common/app-icon'
import { t } from '../../i18n'

export function AiCopilotSetup({ onOpenSettings }: { onOpenSettings(): void }) {
  return (
    <section className="ai-copilot-setup" aria-labelledby="ai-copilot-setup-title">
      <AppIcon name="ai-assistant" size={48} className="ai-copilot-setup-orb" />
      <span className="ai-copilot-eyebrow">{t.aiCopilotPreview}</span>
      <h2 id="ai-copilot-setup-title">{t.aiCopilotNotConfigured}</h2>
      <p>{t.aiCopilotNotConfiguredDescription}</p>
      <button className="ai-copilot-setup-action" type="button" onClick={onOpenSettings}>
        <AppIcon name="ai-settings" size={16} />
        <span>{t.aiCopilotConfigureProvider}</span>
        <AppIcon name="ai-forward" size={16} className="ai-copilot-action-arrow" />
      </button>
      <div className="ai-copilot-principles" aria-label={t.aiCopilotPreview}>
        <article>
          <AppIcon name="ai-shield" size={16} />
          <span>
            <strong>{t.aiCopilotPrivacyTitle}</strong>
            <small>{t.aiCopilotPrivacyDescription}</small>
          </span>
        </article>
        <article>
          <AppIcon name="ai-terminal" size={16} />
          <span>
            <strong>{t.aiCopilotCommandTitle}</strong>
            <small>{t.aiCopilotCommandDescription}</small>
          </span>
        </article>
      </div>
    </section>
  )
}
