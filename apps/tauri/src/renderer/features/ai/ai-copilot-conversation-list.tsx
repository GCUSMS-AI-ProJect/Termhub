import type { AiConversation, AiConversationSummary, AiConversationSearchResult, AiWorkspace } from '@transterm/core'
import { DropdownSelect } from '../common/dropdown-select'
import { aiConversationText } from './ai-conversation-text'
import { t } from '../../i18n'
import { AppIcon } from '../common/app-icon'

export function AiCopilotConversationList({
  conversation,
  conversationSearch,
  filteredConversations,
  isStreaming,
  loadConversation,
  onCloseConversationList,
  onDeleteConversation,
  openNewConversation,
  setConversationSearch,
  workspaces,
  workspaceFilter,
  onWorkspaceFilter,
  error
}: {
  conversation: AiConversation | null
  conversationSearch: string
  filteredConversations: AiConversationSearchResult[]
  workspaces: AiWorkspace[]
  workspaceFilter: string
  onWorkspaceFilter(value: string): void
  error: string | null
  isStreaming: boolean
  loadConversation(conversationId: string): Promise<void>
  onCloseConversationList(): void
  onDeleteConversation(conversation: AiConversationSummary): void
  openNewConversation(): void
  setConversationSearch(value: string): void
}) {
  return (
    <section className="ai-copilot-conversation-list-page" aria-labelledby="ai-copilot-conversation-list-title">
      <header className="ai-copilot-conversation-list-header">
        <div>
          <span className="ai-copilot-eyebrow">{t.aiCopilotConversationLabel}</span>
          <h2 id="ai-copilot-conversation-list-title">{t.aiCopilotConversationLabel}</h2>
          <p>{t.aiCopilotConversationListDescription}</p>
        </div>
        <button
          className="ai-copilot-conversation-new-button"
          disabled={isStreaming}
          type="button"
          onClick={openNewConversation}
        >
          <AppIcon name="ai-plus" size={16} />
          {t.aiCopilotNewChat}
        </button>
      </header>
      <label className="ai-copilot-conversation-search">
        <AppIcon name="ai-search" size={16} />
        <span className="ai-copilot-visually-hidden">{t.aiCopilotHistorySearch}</span>
        <input
          aria-label={t.aiCopilotHistorySearch}
          disabled={isStreaming}
          placeholder={aiConversationText().search}
          type="search"
          value={conversationSearch}
          onChange={(event) => setConversationSearch(event.target.value)}
        />
      </label>
      <DropdownSelect
        className="ai-history-filter"
        ariaLabel={aiConversationText().allWorkspaces}
        value={workspaceFilter}
        options={[
          { value: '', label: aiConversationText().allWorkspaces },
          ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))
        ]}
        onChange={onWorkspaceFilter}
      />
      {error ? <p role="alert">{error}</p> : null}
      <div className="ai-copilot-conversation-list" role="list">
        {filteredConversations.length ? (
          filteredConversations.map((item) => (
            <div
              key={item.id}
              className={`ai-copilot-conversation-list-item ${item.id === conversation?.id ? 'is-active' : ''}`}
              role="listitem"
            >
              <button
                aria-current={item.id === conversation?.id ? 'true' : undefined}
                className="ai-copilot-conversation-list-item-open"
                disabled={isStreaming}
                type="button"
                onClick={() => {
                  onCloseConversationList()
                  void loadConversation(item.id)
                }}
              >
                <AppIcon name="ai-message" size={16} />
                <span className="ai-copilot-conversation-list-item-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {item.messageCount > 0
                      ? t.aiCopilotConversationMessageCount.replace('{count}', String(item.messageCount))
                      : t.aiCopilotConversationNoMessages}
                  </small>
                  {item.snippet ? <small className="ai-history-snippet">{item.snippet}</small> : null}
                </span>
                <AppIcon name="ai-chevron-right" size={16} />
              </button>
              <button
                aria-label={`${t.aiCopilotDeleteConversation}: ${item.title}`}
                className="ai-copilot-conversation-list-item-delete"
                disabled={isStreaming && item.id === conversation?.id}
                title={t.aiCopilotDeleteConversation}
                type="button"
                onClick={() => onDeleteConversation(item)}
              >
                <AppIcon name="ai-trash" size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="ai-copilot-conversation-list-empty">
            <AppIcon name="ai-message" size={16} />
            <strong>{t.aiCopilotConversationListEmpty}</strong>
            <p>{t.aiCopilotConversationListDescription}</p>
          </div>
        )}
      </div>
    </section>
  )
}
