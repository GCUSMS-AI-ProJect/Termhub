import type { AiConversation } from '@transterm/core'
import { useRef } from 'react'
import { aiConversationText } from './ai-conversation-text'
import { VerticalScrollbar } from '../common/vertical-scrollbar'

export function AiTaskSummary({
  conversation,
  busy,
  onResume
}: {
  conversation: AiConversation | null
  busy: boolean
  onResume(): void
}) {
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const stepsRef = useRef<HTMLOListElement>(null)
  const text = aiConversationText(),
    task = conversation?.task,
    budget = conversation?.contextBudget
  if (!task && !budget) return null
  const resumable = task && task.status !== 'completed' && !busy
  const steps = task?.steps ?? []
  const done = steps.filter((step) => step.status === 'completed').length
  return (
    <section className="ai-task-summary" aria-live="polite">
      <header>
        <span>
          {busy ? text.working : resumable ? text.interrupted : text.completed}
          {steps.length ? ` · ${done}/${steps.length}` : ''}
        </span>
        {resumable ? (
          <button type="button" onClick={onResume}>
            {text.resume}
          </button>
        ) : null}
      </header>
      {steps.length ? (
        <details className="ai-task-plan" open={busy || resumable || undefined}>
          <summary title={text.planEvidence}>{text.plan}</summary>
          <div className="ai-task-plan-viewport">
            <ol ref={stepsRef}>
              {steps.map((step, index) => (
                <li key={index} data-status={step.status}>
                  <span className="ai-task-step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{step.title}</span>
                  <span className="ai-task-step-status">
                    {step.status === 'completed'
                      ? text.stepCompleted
                      : step.status === 'in-progress'
                        ? text.inProgress
                        : text.pending}
                  </span>
                </li>
              ))}
            </ol>
            <VerticalScrollbar scrollRef={stepsRef} />
          </div>
        </details>
      ) : null}
      {task?.reason ? <p>{task.reason}</p> : null}
      {budget ? (
        <details>
          <summary>
            {text.budget}: {budget.estimatedTokens.toLocaleString()} / {budget.budgetTokens.toLocaleString()}
          </summary>
          <p>
            {budget.summarizedMessages} {text.summarized}
          </p>
          {budget.summary ? (
            <div className="ai-task-summary-text">
              <p ref={summaryRef}>{budget.summary}</p>
              <VerticalScrollbar scrollRef={summaryRef} />
            </div>
          ) : null}
        </details>
      ) : null}
    </section>
  )
}
