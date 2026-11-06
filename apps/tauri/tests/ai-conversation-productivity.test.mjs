import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, require = () => ({})) {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL('../src/renderer/features/ai/' + file, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    { exports, require, TextEncoder, window: {} }
  )
  return exports
}
const { buildAiFileExcerpt } = load('ai-file-excerpt.ts')
test('draft writes remain ordered across sidebar mounts and an unsuccessful save cannot update the restore pointer', async () => {
  const { persistAiDraft, waitForAiDraftWrites } = load('ai-draft-storage.ts')
  let release
  const firstGate = new Promise((resolve) => {
    release = resolve
  })
  const calls = []
  const api = {
    async saveAiChatDraft(draft) {
      calls.push(`save:${draft.text}`)
      if (draft.text === 'first') await firstGate
      if (draft.text === 'fail') throw Error('disk full')
    },
    async setUiStateItem(_, value) {
      calls.push(`pointer:${JSON.parse(value).scope}`)
    }
  }
  const first = persistAiDraft(api, { scope: 'a', text: 'first', attachments: [] })
  const second = persistAiDraft(api, { scope: 'b', text: 'second', attachments: [] })
  release()
  await Promise.all([first, second, waitForAiDraftWrites()])
  assert.deepEqual(calls, ['save:first', 'pointer:a', 'save:second', 'pointer:b'])
  await assert.rejects(persistAiDraft(api, { scope: 'failed', text: 'fail', attachments: [] }))
  await persistAiDraft(api, { scope: 'recovered', text: 'third', attachments: [] })
  assert(!calls.includes('pointer:failed'))
  assert.equal(calls.at(-1), 'pointer:recovered')
})
test('file references send only selected lines with correct source, normalized bounds and UTF-8 size', () => {
  const result = buildAiFileExcerpt(
    'private first\r\n用户选择\r\nprivate last',
    '/logs/app.log',
    'server.example',
    2,
    2
  )
  assert.equal(result.selected, '用户选择')
  assert(!result.text.includes('private'))
  assert(result.text.includes('Lines: 2-2'))
  assert(result.text.includes('/logs/app.log'))
  assert.equal(result.size, new TextEncoder().encode(result.text).length)
  assert.equal(buildAiFileExcerpt('a\nb', 'x', 'local', 20, 1).selected, 'b')
})
const { handleAiStreamEvent } = load('ai-copilot-stream.ts', () => ({
  preserveLocalConversationTitle: (_, next) => next
}))
test('task checkpoints and context budgets preserve the active stream and expose saved progress', () => {
  let conversation = { id: 'chat', messages: [] },
    streaming = true
  const state = {
    mountedRef: { current: true },
    activeConversationIdRef: { current: 'chat' },
    conversationRef: { current: conversation },
    applyConversation(next) {
      conversation = next
    },
    setConversation(update) {
      conversation = update(conversation)
    },
    setIsStreaming(value) {
      streaming = value
    }
  }
  handleAiStreamEvent(state, 'chat', {
    type: 'checkpoint',
    conversation: {
      id: 'chat',
      messages: [{ id: 'a', role: 'assistant', content: 'already completed' }],
      task: { status: 'running', userMessageId: 'u' }
    }
  })
  assert.equal(conversation.messages[0].content, 'already completed')
  assert(streaming)
  handleAiStreamEvent(state, 'chat', {
    type: 'context-budget',
    estimatedTokens: 80,
    budgetTokens: 100,
    summarizedMessages: 12,
    summary: 'Earlier work'
  })
  assert.equal(conversation.contextBudget.summarizedMessages, 12)
  assert.equal(conversation.messages[0].content, 'already completed')
})
test('running tool output updates one activity and remains distinct from completed output', () => {
  let activities = [{ proposal: { id: 'p' } }]
  let conversation = { id: 'chat', messages: [{ id: 'a', toolActivities: activities }] }
  const state = {
    mountedRef: { current: true },
    activeConversationIdRef: { current: 'chat' },
    conversationRef: { current: conversation },
    setToolActivities(update) {
      activities = update(activities)
    },
    setConversation(update) {
      conversation = update(conversation)
    }
  }
  handleAiStreamEvent(state, 'chat', {
    type: 'tool-progress',
    result: { proposalId: 'p', status: 'running', stdout: 'first output', durationMs: 1000 }
  })
  handleAiStreamEvent(state, 'chat', {
    type: 'tool-progress',
    result: { proposalId: 'p', status: 'running', stdout: 'first output\nsecond output', durationMs: 2000 }
  })
  assert.equal(activities.length, 1)
  assert.equal(conversation.messages[0].toolActivities[0].result.stdout, 'first output\nsecond output')
  assert.equal(activities[0].result.status, 'running')
})
