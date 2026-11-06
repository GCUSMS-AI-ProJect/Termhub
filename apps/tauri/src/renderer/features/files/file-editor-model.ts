import { editor } from 'monaco-editor'
import type { FileContentSnapshot, RemoteSystemPlatform } from '@transterm/core'

export function loadFileEditorModel(
  model: editor.ITextModel,
  file: FileContentSnapshot,
  remotePlatform?: RemoteSystemPlatform
) {
  // Loading through the React value prop can normalize LF to an empty Windows model's CRLF.
  if (model.getValue() !== file.content) model.setValue(file.content)

  const posixRemote =
    file.source === 'remote' &&
    (remotePlatform === 'linux' ||
      remotePlatform === 'busybox' ||
      remotePlatform === 'darwin' ||
      remotePlatform === 'freebsd')
  const shellScript =
    /\.(?:sh|bash|zsh|ksh|fish)$/i.test(file.name) || /^#![^\r\n]*\b(?:sh|bash|dash|zsh|ksh|fish)\b/.test(file.content)
  if (!/[\r\n]/.test(file.content) && (posixRemote || shellScript)) {
    model.setEOL(editor.EndOfLineSequence.LF)
  }
}
