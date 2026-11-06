import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function loadModule(path, dependencies = {}) {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }).outputText,
    {
      exports,
      require(name) {
        if (name in dependencies) return dependencies[name]
        throw new Error(`Unexpected dependency: ${name}`)
      },
      URL,
      performance,
      Event,
      window: { dispatchEvent() {} }
    }
  )
  return exports
}

const constants = loadModule('../src/renderer/features/settings/settings-modal/constants.tsx', {
  react: {},
  'react/jsx-runtime': {},
  '@transterm/core': {},
  '../../../app/theme-config': {}
})
const reasoning = loadModule('../src/renderer/features/ai/ai-reasoning.ts', {
  '../settings/settings-modal/constants': constants
})
const controller = loadModule('../src/renderer/features/settings/settings-modal/controller/ai.ts', {
  react: {
    useEffect() {},
    useMemo: (calculate) => calculate(),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}]
  },
  '../../../../i18n': { t: {} },
  '../../../common/operation-timing': { waitForMinimumBusyDuration: async () => {} },
  '../constants': constants
})

function preset(id) {
  return constants.AI_PROVIDER_PRESETS.find((item) => item.id === id)
}

function stateFor(provider) {
  const state = {
    activeTab: 'interface',
    aiDraft: provider ?? constants.createAiProviderDraft(),
    aiProviders: provider ? [provider] : [],
    aiModelChoices: [],
    configuredModels: provider?.models ?? [],
    selectedCandidateModel: '',
    isCustomInput: false,
    customModelText: '',
    aiApiKey: '',
    clearAiApiKey: false,
    aiMessage: null,
    aiOperation: null,
    aiActionInFlightRef: { current: false },
    showDeleteAiProviderConfirm: false
  }
  for (const key of Object.keys(state)) {
    state[`set${key[0].toUpperCase()}${key.slice(1)}`] = (next) => {
      state[key] = typeof next === 'function' ? next(state[key]) : next
    }
  }
  return state
}

test('official Gemini preset targets the compatibility endpoint and only offers supported thinking levels', () => {
  const gemini = preset('google-gemini').draft
  assert.equal(
    constants.aiProviderRequestUrlPreview(gemini),
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  )
  assert.deepEqual([...reasoning.getAiReasoningOptions(gemini, gemini.model)], ['low', 'medium', 'high'])
  assert.equal(reasoning.supportsAiModelInput(gemini, gemini.model, 'image'), true)
  assert.equal(reasoning.supportsAiModelInput(gemini, gemini.model, 'pdf'), false)
  assert.equal(reasoning.supportsAiReasoningEffort(gemini, 'gemini-2.5-flash', 'none'), true)
  assert.equal(reasoning.supportsAiReasoningEffort(gemini, 'gemini-2.5-pro', 'none'), false)
  assert.equal(reasoning.getAiReasoningProfile(gemini, 'models/gemini-3.8-flash').control, 'effort')
  assert.equal(reasoning.getAiReasoningProfile(gemini, 'gemini-2.5-flash-image').control, 'none')
  assert.equal(reasoning.getAiReasoningProfile(gemini, 'unknown-model').control, 'none')
})

test('Qwen distinguishes hybrid vision models from code and always-thinking models', () => {
  const qwen = preset('qwen-dashscope').draft
  assert.deepEqual([...reasoning.getAiReasoningOptions(qwen, qwen.model)], ['none', 'low'])
  assert.equal(reasoning.supportsAiModelInput(qwen, qwen.model, 'image'), true)
  assert.equal(reasoning.supportsAiModelInput(qwen, 'qwen3-coder-plus', 'image'), false)
  assert.equal(reasoning.getAiReasoningProfile(qwen, 'qwen3-coder-plus').control, 'none')
  assert.equal(reasoning.getAiReasoningProfile(qwen, 'qwen3.8-2.4t-a95b').control, 'none')
  assert.equal(
    reasoning.getAiReasoningProfile(
      { ...qwen, baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' },
      'qwen3.8-flash'
    ).control,
    'toggle'
  )
})

test('custom provider names cannot impersonate an official endpoint or hide manual capability controls', () => {
  const gemini = preset('google-gemini').draft
  assert.equal(constants.isAiManualCapabilityProvider({ ...gemini, baseUrl: `${gemini.baseUrl}/` }), false)
  assert.equal(constants.isAiManualCapabilityProvider({ ...gemini, baseUrl: 'https://gateway.example/v1' }), true)
  assert.equal(constants.isAiManualCapabilityProvider({ ...gemini, kind: 'openai-responses' }), true)
  const override = {
    inputModalities: ['text'],
    reasoning: { mode: 'none', parameter: 'auto', efforts: [] }
  }
  assert.equal(
    reasoning.getAiModelCapabilities({ ...gemini, modelCapabilities: { [gemini.model]: override } }, gemini.model),
    override
  )
})

test('choosing a provider preset configures its default model while preserving draft preferences', () => {
  const state = stateFor()
  state.aiDraft.enabled = false
  state.aiDraft.isDefault = false
  state.aiApiKey = 'fixture-key'
  controller.useAiSettingsController({ state }).applyAiPreset(preset('google-gemini'))
  assert.equal(state.aiDraft.model, 'gemini-3.8-flash')
  assert.deepEqual([...state.configuredModels], ['gemini-3.8-flash'])
  assert.equal(state.aiDraft.enabled, false)
  assert.equal(state.aiDraft.isDefault, false)
  assert.equal(state.aiApiKey, 'fixture-key')
  controller.useAiSettingsController({ state }).applyAiPreset(preset('ollama-local'))
  assert.equal(state.aiDraft.model, '')
  assert.deepEqual([...state.configuredModels], [])
})

test('editing and saving an official provider retains explicit model capability overrides', async () => {
  const gemini = preset('google-gemini').draft
  const capabilities = {
    inputModalities: ['text'],
    reasoning: { mode: 'none', parameter: 'auto', efforts: [] }
  }
  const saved = {
    ...constants.createAiProviderDraft(),
    ...gemini,
    id: 'fixture-provider',
    models: [gemini.model],
    modelCapabilities: { [gemini.model]: capabilities }
  }
  const state = stateFor(saved)
  controller.useAiSettingsController({ state }).selectAiProvider(saved)
  assert.equal(state.aiDraft.modelCapabilities[gemini.model], capabilities)
  let sent
  await controller
    .useAiSettingsController({
      state,
      desktopApi: {
        async saveAiProvider(input) {
          sent = input.provider
          return saved
        },
        async listAiProviders() {
          return [saved]
        }
      }
    })
    .saveAiProvider()
  assert.equal(sent.modelCapabilities[gemini.model], capabilities)
})

test('capability tests are explicit, preserve custom models and report partial failure', async () => {
  const state = stateFor({
    ...constants.createAiProviderDraft(),
    model: 'custom-private-model',
    models: ['custom-private-model']
  })
  let calls = 0
  let sent
  const actions = controller.useAiSettingsController({
    state,
    desktopApi: {
      async testAiProvider(input) {
        calls += 1
        sent = input
        return {
          ok: false,
          message: 'Tools unsupported',
          checks: [{ check: 'tools', status: 'failed', durationMs: 17, message: 'Tools unsupported' }]
        }
      }
    }
  })
  assert.equal(calls, 0)
  await actions.testAiProvider(['streaming', 'tools', 'image'])
  assert.equal(calls, 1)
  assert.equal(sent.provider.model, 'custom-private-model')
  assert.deepEqual([...sent.checks], ['streaming', 'tools', 'image'])
  assert.equal(state.aiMessage.kind, 'error')
  assert.equal(state.aiOperation, null)
  assert.equal(state.aiActionInFlightRef.current, false)
  assert.equal(state.aiDraft.model, 'custom-private-model')
})
