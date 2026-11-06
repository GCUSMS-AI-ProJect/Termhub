import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/renderer/features/ai/ai-attachment-utils.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText,
  { exports, TextDecoder, Uint8Array, crypto: webcrypto, btoa }
)

test('code attachments retain their UTF-8 bytes for the native upload', async () => {
  const content = 'const 你好 = "evidence"'
  const file = await exports.readAiAttachment(new File([content], 'source.ts'))
  assert.equal(file.kind, 'text')
  assert.equal(Buffer.from(file.upload.data, 'base64').toString(), content)
  assert.equal(file.preview, undefined)
})

test('image and PDF uploads retain binary content and image preview', async () => {
  const png = Buffer.from('89504e470d0a1a0a010203', 'hex')
  const image = await exports.readAiAttachment(new File([png], 'image.png'))
  assert.equal(image.kind, 'image')
  assert.equal(image.preview, `data:image/png;base64,${png.toString('base64')}`)
  const pdf = await exports.readAiAttachment(new File(['%PDF-1.4 fixture'], 'file.pdf'))
  assert.equal(pdf.kind, 'pdf')
  assert.equal(Buffer.from(pdf.upload.data, 'base64').toString(), '%PDF-1.4 fixture')
})

test('unsupported and oversized uploads fail before submission', async () => {
  for (const file of [
    new File([], 'empty'),
    new File([Buffer.from([0, 1, 2])], 'binary'),
    new File(['a'.repeat(128 * 1024 + 1)], 'large.txt')
  ])
    await assert.rejects(exports.readAiAttachment(file))
  assert.equal(exports.validateAttachmentSelection(Array(8).fill({ size: 1 }), [{ size: 1 }]), false)
  assert.equal(exports.validateAttachmentSelection([{ size: 20 * 1024 * 1024 }], [{ size: 1 }]), false)
  assert.equal(exports.validateAttachmentSelection([], [{ size: 100 }]), true)
})
