import { invoke } from '@tauri-apps/api/core'
import type {
  AiAttachmentUpload,
  AiChatDraft,
  AiConversation,
  AiConversationSearchResult,
  ForkAiConversationInput
} from '@transterm/core'

export const aiConversationActionsApi = {
  searchAiConversations: (query: string, workspaceId?: string) =>
    invoke<AiConversationSearchResult[]>('app_search_ai_conversations', { query, workspaceId }),
  forkAiConversation: (input: ForkAiConversationInput) => invoke<AiConversation>('app_fork_ai_conversation', { input }),
  getAiChatDraft: (scope: string) => invoke<AiChatDraft | null>('app_get_ai_chat_draft', { scope }),
  saveAiChatDraft: (input: AiChatDraft) => invoke<void>('app_save_ai_chat_draft', { input }),
  getAiMessageAttachments: (conversationId: string, messageId: string) =>
    invoke<AiAttachmentUpload[]>('app_get_ai_message_attachments', { conversationId, messageId })
}
