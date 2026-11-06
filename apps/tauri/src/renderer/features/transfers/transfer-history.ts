import type { TransferTask } from '@transterm/core'
import { TRANSFER_HISTORY_LIMIT } from '@transterm/shared'

/** Match the durable journal: never expire unfinished work or recoverable artifacts. */
export function retainTransferHistory(tasks: TransferTask[]): TransferTask[] {
  if (tasks.length <= TRANSFER_HISTORY_LIMIT) return tasks
  const required = new Set<number>()
  const history: number[] = []
  tasks.forEach((task, index) => {
    if (!['done', 'failed', 'canceled'].includes(task.status) || task.resumable || task.cleanupPending) {
      required.add(index)
    } else history.push(index)
  })
  history.sort((a, b) => {
    const left = tasks[a].updatedAt ?? tasks[a].createdAt ?? 0
    const right = tasks[b].updatedAt ?? tasks[b].createdAt ?? 0
    return right - left || b - a
  })
  for (const index of history.slice(0, Math.max(0, TRANSFER_HISTORY_LIMIT - required.size))) required.add(index)
  return tasks.filter((_, index) => required.has(index))
}

export function updateTransferHistory(tasks: TransferTask[], update: TransferTask): TransferTask[] {
  const index = tasks.findIndex((task) => task.id === update.id)
  if (index >= 0 && tasks[index] === update) return tasks
  const next = [...tasks]
  if (index < 0) next.push(update)
  else next[index] = update
  return retainTransferHistory(next)
}
