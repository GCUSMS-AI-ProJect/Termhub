import type { SessionSnapshot } from '@transterm/core'

export interface MonitoringTarget {
  tabId: string
  session: SessionSnapshot
}

export interface MonitoringSource {
  tabId: string | null
  session: SessionSnapshot | null
  /** Every live session on the same machine, so stop/start applies to all of them. */
  peers: MonitoringTarget[]
}

/**
 * Sessions opened from one profile share a single collector: a session in the
 * `shared` phase shows the samples of the tab that collects for its machine.
 */
export function resolveMonitoringSource(
  tabId: string | null,
  sessions: Readonly<Record<string, SessionSnapshot>>
): MonitoringSource {
  const own = tabId ? (sessions[tabId] ?? null) : null
  const leaderTabId = own?.monitoring?.phase === 'shared' ? own.monitoring.sharedFromTabId : undefined
  const sameTarget = (session: SessionSnapshot) =>
    Boolean(own?.monitoring?.targetKey) &&
    session.profileId === own?.profileId &&
    session.monitoring?.targetKey === own?.monitoring?.targetKey
  const leader = leaderTabId ? sessions[leaderTabId] : undefined
  const collecting =
    own?.monitoring?.phase !== 'healthy'
      ? Object.entries(sessions).find(
          ([, session]) => session.connected && sameTarget(session) && session.monitoring?.phase === 'healthy'
        )
      : undefined
  const source = collecting
    ? { tabId: collecting[0], session: collecting[1] }
    : leaderTabId && leader?.connected && sameTarget(leader)
      ? { tabId: leaderTabId, session: leader }
      : { tabId, session: own }
  const peers = source.session
    ? Object.entries(sessions)
        .filter(
          ([, session]) =>
            (sameTarget(session) || session === own) &&
            session.connected &&
            session.monitoring &&
            session.capabilities?.resourceMonitoring !== false
        )
        .map(([peerTabId, session]) => ({ tabId: peerTabId, session }))
    : []
  return { ...source, peers }
}
