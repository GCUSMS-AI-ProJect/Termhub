import { useEffect, type RefObject } from 'react'

export function useAiPanelSelection(panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.anchorNode) return

      const panel = panelRef.current
      if (!panel) return

      const isAnchorInside = panel.contains(selection.anchorNode)
      const isFocusInside = selection.focusNode ? panel.contains(selection.focusNode) : false

      if (isAnchorInside && !isFocusInside) {
        const range = selection.getRangeAt(0)
        const treeWalker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
        let lastTextNode: Node | null = null
        while (treeWalker.nextNode()) {
          lastTextNode = treeWalker.currentNode
        }
        if (lastTextNode) {
          try {
            range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0)
            selection.removeAllRanges()
            selection.addRange(range)
          } catch {
            selection.collapseToStart()
          }
        } else {
          selection.collapseToStart()
        }
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [panelRef])
}
