import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { AiMessage } from '@transterm/core'

/** Follow incoming output only while the reader stays at the end of the conversation. */
export function useAiMessageScroll(
  viewportRef: RefObject<HTMLDivElement | null>,
  conversationId: string | undefined,
  messages: AiMessage[] | undefined
) {
  const contentRef = useRef<HTMLDivElement>(null)
  const followsLatestRef = useRef(true)
  const userMessageCountRef = useRef(0)
  const [showScrollToLatest, setShowScrollToLatest] = useState(false)

  const measureScroll = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const isAtEnd = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 64
    followsLatestRef.current = isAtEnd
    setShowScrollToLatest(!isAtEnd)
  }, [viewportRef])

  const scrollToLatest = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    followsLatestRef.current = true
    viewport.scrollTop = viewport.scrollHeight
    setShowScrollToLatest(false)
  }, [viewportRef])

  useLayoutEffect(() => {
    followsLatestRef.current = true
    scrollToLatest()
  }, [conversationId, scrollToLatest])

  useLayoutEffect(() => {
    const userMessageCount = messages?.filter((message) => message.role === 'user').length ?? 0
    const submittedNewTurn = userMessageCount > userMessageCountRef.current
    userMessageCountRef.current = userMessageCount
    if (followsLatestRef.current || submittedNewTurn) scrollToLatest()
  }, [messages, scrollToLatest])

  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (followsLatestRef.current) scrollToLatest()
        else measureScroll()
      })
    })
    observer.observe(content)
    observer.observe(viewport)
    viewport.addEventListener('scroll', measureScroll, { passive: true })
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      viewport.removeEventListener('scroll', measureScroll)
    }
  }, [measureScroll, scrollToLatest, viewportRef])

  return { contentRef, scrollToLatest, showScrollToLatest }
}
