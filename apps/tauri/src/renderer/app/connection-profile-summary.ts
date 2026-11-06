import type { ConnectionProfile } from '@transterm/core'

export function connectionProfileSummary(profile: ConnectionProfile): string {
  if (profile.type !== 'serial') return `${profile.username}@${profile.host}`
  const parity = { none: 'N', odd: 'O', even: 'E', mark: 'M', space: 'S' }[profile.parity ?? 'none']
  return `${profile.devicePath} · ${profile.baudRate ?? 115200} baud · ${profile.dataBits ?? 8}${parity}${profile.stopBits ?? 1}`
}
