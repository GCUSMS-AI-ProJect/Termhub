/**
 * The home stage fade is only wanted on the first home view and on "+"-created
 * tabs. Home tab switches and closes must not replay it. Marking the created
 * key lets the transition effect allow exactly that change without touching
 * the original animation CSS or timing.
 */
const allowedHomeTransitionKeys = new Set<string>()

export function markHomeTabTransition(homeTabKey: string) {
  allowedHomeTransitionKeys.add(homeTabKey)
}

export function consumeHomeTabTransition(homeTabKey: string) {
  return allowedHomeTransitionKeys.delete(homeTabKey)
}

export function peekHomeTabTransition(homeTabKey: string) {
  return allowedHomeTransitionKeys.has(homeTabKey)
}
