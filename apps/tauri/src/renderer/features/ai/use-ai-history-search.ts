import { useEffect, useState } from 'react'
import type { AiConversationSummary, AiConversationSearchResult } from '@transterm/core'
export function useAiHistorySearch(conversations: AiConversationSummary[], query: string, workspaceId: string) {
  const [results, setResults] = useState<AiConversationSearchResult[]>(conversations)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (!query.trim() && !workspaceId) {
      setResults(conversations)
      setError(null)
      return
    }
    const timer = window.setTimeout(
      () =>
        void window.transterm
          ?.searchAiConversations(query, workspaceId || undefined)
          .then((items) => {
            if (live) {
              setResults(items)
              setError(null)
            }
          })
          .catch((error) => {
            if (live) setError(String(error))
          }),
      180
    )
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [conversations, query, workspaceId])
  return { results, error }
}
