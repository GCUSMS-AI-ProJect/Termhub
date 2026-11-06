import type { RemoteFileItem } from '@transterm/core'

export function remoteDirectoryAncestors(path: string): string[] {
  const normalized = path.replace(/\/+$/, '') || '/'
  if (!normalized.startsWith('/')) return [normalized]
  const result = ['/']
  let current = ''
  for (const part of normalized.split('/').filter(Boolean)) {
    current += `/${part}`
    result.push(current)
  }
  return result
}

export function remoteDirectories(items: RemoteFileItem[]) {
  return items
    .filter((item) => item.type === 'folder' && item.name !== '..' && item.name !== '.')
    .sort((left, right) => left.name.localeCompare(right.name))
}

export type RemoteDirectoryRow = { path: string; name: string; depth: number; parent: string | null }

export function remoteDirectoryRows(
  cache: Record<string, RemoteFileItem[]>,
  expanded: Set<string>,
  currentPath: string
): RemoteDirectoryRow[] {
  const chain = remoteDirectoryAncestors(currentPath)
  const result: RemoteDirectoryRow[] = []
  const visit = (path: string, name: string, depth: number, parent: string | null, ancestors: Set<string>) => {
    if (ancestors.has(path)) return
    result.push({ path, name, depth, parent })
    if (!expanded.has(path)) return
    const children = (Object.hasOwn(cache, path) ? cache[path]! : []).map((item) => ({
      path: item.path,
      name: item.name
    }))
    const next = chain[chain.indexOf(path) + 1]
    // Keep the current directory reachable when an ancestor cannot be listed.
    if (chain.includes(path) && next && !children.some((child) => child.path === next)) {
      children.push({ path: next, name: next.split('/').at(-1) || '/' })
    }
    children.sort((left, right) => left.name.localeCompare(right.name))
    for (const child of children) visit(child.path, child.name, depth + 1, path, new Set([...ancestors, path]))
  }
  const root = chain[0]!
  visit(root, root, 0, null, new Set())
  return result
}
