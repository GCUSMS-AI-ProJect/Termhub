import { useRef } from 'react'
import { t } from '../../i18n'
import { VerticalScrollbar } from '../common/vertical-scrollbar'
import './file-change-diff.css'

/** Fold the unchanged prefix/suffix while preserving every changed line. */
export function fileChangeLines(before: string, after: string) {
  const original = before.split('\n')
  const modified = after.split('\n')
  let prefix = 0
  while (prefix < original.length && prefix < modified.length && original[prefix] === modified[prefix]) prefix++
  let suffix = 0
  while (
    suffix < original.length - prefix &&
    suffix < modified.length - prefix &&
    original[original.length - suffix - 1] === modified[modified.length - suffix - 1]
  )
    suffix++
  return { original, modified, prefix, suffix }
}

export function FileChangeDiff({ before, after }: { before: string; after: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { original, modified, prefix, suffix } = fileChangeLines(before, after)
  return (
    <div className="file-change-diff-wrap">
      <div className="file-change-diff" ref={scrollRef} role="region" aria-label={t.fileChangePreview} tabIndex={0}>
        {prefix ? <small>{t.fileChangeUnchanged.replace('{count}', String(prefix))}</small> : null}
        <div aria-label={t.fileChangeBefore} className="file-change-removed">
          {original.slice(prefix, original.length - suffix).map((line, index) => (
            <pre key={index}>
              <span aria-hidden="true">− {prefix + index + 1} </span>
              {line || ' '}
            </pre>
          ))}
        </div>
        <div aria-label={t.fileChangeAfter} className="file-change-added">
          {modified.slice(prefix, modified.length - suffix).map((line, index) => (
            <pre key={index}>
              <span aria-hidden="true">+ {prefix + index + 1} </span>
              {line || ' '}
            </pre>
          ))}
        </div>
        {suffix ? <small>{t.fileChangeUnchanged.replace('{count}', String(suffix))}</small> : null}
      </div>
      <VerticalScrollbar scrollRef={scrollRef} ariaLabel={t.fileChangePreview} />
    </div>
  )
}
