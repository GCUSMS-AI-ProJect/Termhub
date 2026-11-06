import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/renderer/features/ai/ai-copilot-stream.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText,
  { exports, require: () => ({}) }
)

test('REA progress updates acquire their approval ID without duplicating or losing the existing card', () => {
  let activities = []
  let conversation = {
    id: 'conversation',
    messages: [{ id: 'assistant', role: 'assistant', content: '', toolActivities: [] }]
  }
  const state = {
    mountedRef: { current: true },
    activeConversationIdRef: { current: 'conversation' },
    activeAssistantMessageIdRef: { current: 'assistant' },
    conversationRef: { current: conversation },
    setToolActivities(update) {
      activities = update(activities)
    },
    setConversation(update) {
      conversation = update(conversation)
    }
  }
  const proposal = { id: 'rea-call', toolName: 'transterm_rea', command: 'REA call inspect', risk: 'unknown' }
  exports.handleAiStreamEvent(state, 'conversation', { type: 'tool-call', proposal })
  const approvedProposal = { ...proposal, approvalRequestId: 'approval', risk: 'read-only' }
  exports.handleAiStreamEvent(state, 'conversation', { type: 'tool-call', proposal: approvedProposal })
  assert.equal(activities.length, 1)
  assert.equal(activities[0].proposal.approvalRequestId, 'approval')
  assert.equal(conversation.messages[0].toolActivities.length, 1)
  assert.equal(conversation.messages[0].toolActivities[0].proposal.approvalRequestId, 'approval')
  assert.equal(conversation.messages[0].toolActivities[0].proposal.risk, 'read-only')
})
