import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AiCopilotMode, ReaStatus, ReaPreparationStage, SessionSnapshot, WorkspaceTab } from '@transterm/core'
import { formatMessage, t } from '../../i18n'
import { AppIcon } from '../common/app-icon'
import { VerticalScrollbar } from '../common/vertical-scrollbar'
import { Button } from '../../components/common/button/button'
import { Tooltip } from '../../components/common/tooltip/tooltip'
import './ai-rea-control.css'

export function AiReaControl({
  activeSession,
  activeTab,
  rootTab,
  mode,
  isStreaming,
  onAnalyze
}: {
  activeSession: SessionSnapshot | null
  activeTab: WorkspaceTab | null
  rootTab: WorkspaceTab | null
  mode: AiCopilotMode
  isStreaming: boolean
  onAnalyze(target: string): void
}) {
  const [status, setStatus] = useState<ReaStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<ReaPreparationStage | null>(null)
  const [reading, setReading] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [path, setPath] = useState('')
  const [open, setOpen] = useState(false)
  const [clickSequence, setClickSequence] = useState(0)
  const controlRef = useRef<HTMLDivElement>(null)
  const detailsButtonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const requestRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const connected = activeSession?.connected === true
  const revision = activeSession?.aiSessionRevision
  const supported =
    connected &&
    (activeTab?.sessionType === 'local' || activeTab?.sessionType === 'ssh') &&
    activeSession?.deviceMode !== 'network-device'
  const remote = activeTab?.sessionType === 'ssh'
  const host = remote ? activeSession?.accessHost || activeTab?.title : t.reaLocal

  useEffect(() => {
    setStatus(null)
    setError('')
    setBusy(false)
    setStage(null)
    setStopping(false)
    setPath('')
    setOpen(false)
    let current = true
    const api = window.transterm
    setReading(Boolean(api && supported && activeTab && rootTab))
    if (api && supported && activeTab && rootTab) {
      void api
        .getReaActivation({ tabId: activeTab.id, rootTabId: rootTab.id, requestId: crypto.randomUUID() })
        .then((result) => {
          if (current) setStatus(result.enabled ? result.status : null)
        })
        .catch((e) => {
          if (current) setError(String(e))
        })
        .finally(() => {
          if (current) setReading(false)
        })
    }
    return () => {
      current = false
      const id = requestRef.current
      requestRef.current = null
      if (id && api && activeTab && rootTab) {
        void api.cancelReaCheck(id).catch(() => undefined)
        void api
          .setReaEnabled({ tabId: activeTab.id, rootTabId: rootTab.id, requestId: crypto.randomUUID(), enabled: false })
          .catch(() => undefined)
      }
    }
  }, [activeTab?.id, rootTab?.id, revision, connected, supported])

  useEffect(() => {
    if (!open) return
    popoverRef.current?.focus()
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !controlRef.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      )
        setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      detailsButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      const anchor = controlRef.current?.getBoundingClientRect()
      const popover = popoverRef.current
      if (!anchor || !popover) return
      const bounds = popover.getBoundingClientRect()
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - bounds.width - 12))
      const above = anchor.top - bounds.height - 12
      const top = above >= 12 ? above : anchor.bottom + 12
      popover.style.left = `${left}px`
      popover.style.top = `${Math.max(12, Math.min(top, window.innerHeight - bounds.height - 12))}px`
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    const observer = new ResizeObserver(position)
    if (popoverRef.current) observer.observe(popoverRef.current)
    if (controlRef.current) observer.observe(controlRef.current)
    if (controlRef.current?.parentElement) observer.observe(controlRef.current.parentElement)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      observer.disconnect()
    }
  }, [open])

  const change = async (enabled: boolean) => {
    const api = window.transterm
    if (!api || !activeTab || !rootTab || (enabled && (!supported || requestRef.current))) return
    const previous = requestRef.current
    if (previous) void api.cancelReaCheck(previous).catch(() => undefined)
    const id = crypto.randomUUID()
    requestRef.current = id
    setBusy(true)
    setStage(null)
    if (enabled) setOpen(true)
    setStopping(!enabled)
    setError('')
    setStatus(null)
    try {
      const result = await api.setReaEnabled(
        { tabId: activeTab.id, rootTabId: rootTab.id, requestId: id, enabled },
        (progress) => {
          if (requestRef.current === id && progress.requestId === id) setStage(progress.stage)
        }
      )
      if (requestRef.current === id) setStatus(result.enabled ? result.status : null)
    } catch (e) {
      if (requestRef.current === id) {
        setError(String(e))
        setOpen(true)
      }
    } finally {
      if (requestRef.current === id) {
        requestRef.current = null
        setBusy(false)
        setStage(null)
        setStopping(false)
      }
    }
  }

  const actionLabel = stopping ? t.reaStopping : busy ? t.reaCancel : status ? t.reaDisable : t.reaConnect
  const preparationLabels: Record<ReaPreparationStage, string> = {
    'checking-runtime': t.reaStageChecking,
    'preparing-package': t.reaStageDownloading,
    starting: t.reaStageStarting,
    'checking-engines': t.reaStageEngines,
    ready: t.reaStageEngines
  }
  const statusLabel = !supported
    ? t.reaSelectTarget
    : reading
      ? t.reaReading
      : stopping
        ? t.reaStopping
        : busy
          ? stage
            ? preparationLabels[stage]
            : t.reaConnecting
          : status
            ? formatMessage(t.reaReady, { count: status.toolCount })
            : formatMessage(t.reaDefault, { host: host ?? '' })

  return (
    <div className="ai-rea-control" ref={controlRef}>
      <Tooltip label={actionLabel} description={error || statusLabel} disabled={open}>
        <Button
          variant={status ? 'primary' : 'ghost'}
          size="compact"
          className={`ai-rea-toggle ${status ? 'is-enabled' : ''} ${busy || reading ? 'is-busy' : ''} ${error ? 'has-error' : ''}`}
          disabled={!supported || reading || stopping || (isStreaming && !status && !busy)}
          aria-label={`${t.reaTitle} · ${actionLabel}`}
          aria-describedby={`${id}-status`}
          aria-busy={busy || reading}
          aria-pressed={Boolean(status)}
          onClick={() => {
            setClickSequence((value) => value + 1)
            void change(!status && !busy)
          }}
        >
          <AppIcon className="ai-rea-glyph" name="ai-analysis" size={18} />
          {busy || reading ? <span className="ai-rea-spinner" aria-hidden="true" /> : null}
          {status ? <AppIcon className="ai-rea-enabled-mark" name="ai-check" size={10} /> : null}
          {error ? (
            <span className="ai-rea-error-mark" aria-hidden="true">
              !
            </span>
          ) : null}
          {clickSequence > 0 ? <span key={clickSequence} className="ai-rea-click-wave" aria-hidden="true" /> : null}
        </Button>
      </Tooltip>
      <Tooltip label={t.reaAnalyzeTarget} description={t.reaDetailsHint} disabled={open}>
        <Button
          ref={detailsButtonRef}
          variant="ghost"
          size="compact"
          className={`ai-rea-details-toggle ${open ? 'is-open' : ''}`}
          aria-label={`${t.reaTitle} · ${t.reaAnalyzeTarget}`}
          aria-expanded={open}
          aria-controls={open ? `${id}-details` : undefined}
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
        >
          <AppIcon name="ai-chevron-up" size={12} />
        </Button>
      </Tooltip>
      <span id={`${id}-status`} className="ai-copilot-visually-hidden" role="status" aria-atomic="true">
        {error || statusLabel}
      </span>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={`${id}-details`}
              className="ai-rea-popover"
              role="dialog"
              aria-labelledby={`${id}-title`}
              tabIndex={-1}
            >
              <div className="ai-rea-heading">
                <strong id={`${id}-title`}>
                  <AppIcon name="ai-analysis" size={14} />
                  {t.reaTitle}
                </strong>
                <Button
                  variant="ghost"
                  size="compact"
                  className="ai-rea-popover-close"
                  aria-label={t.reaCloseDetails}
                  onClick={() => {
                    setOpen(false)
                    detailsButtonRef.current?.focus()
                  }}
                >
                  <AppIcon name="ai-close" size={14} />
                </Button>
              </div>
              <div className="ai-rea-scroll" ref={scrollRef}>
                <p className="ai-rea-status">{statusLabel}</p>
                {error ? <p className="ai-rea-error">{error}</p> : null}
                {status?.engines?.length ? (
                  <div className="ai-rea-engine-status">
                    <strong>{t.reaEngineStatusTitle}</strong>
                    <ul>
                      {status.engines.map((engine) => (
                        <li key={engine.id} data-status={engine.status}>
                          <span>{engine.name}</span>
                          <Tooltip label={engine.name} description={engine.detail}>
                            <span tabIndex={0}>
                              {engine.status === 'available'
                                ? t.reaEngineAvailable
                                : engine.status === 'unavailable'
                                  ? t.reaEngineUnavailable
                                  : t.reaEngineUnknown}
                            </span>
                          </Tooltip>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p>{remote ? t.reaRemoteSummary : t.reaLocalSummary}</p>
                <label htmlFor={`${id}-path`}>{t.reaTargetPath}</label>
                <div className="ai-rea-target">
                  <input
                    id={`${id}-path`}
                    value={path}
                    placeholder={remote ? t.reaRemotePathPlaceholder : t.reaPathPlaceholder}
                    disabled={!supported || isStreaming}
                    spellCheck={false}
                    autoCapitalize="none"
                    onChange={(event) => setPath(event.currentTarget.value)}
                  />
                  <Button
                    size="compact"
                    disabled={
                      !supported || !status || busy || isStreaming || !path.trim() || mode === 'pure-conversation'
                    }
                    onClick={() => {
                      onAnalyze(path.trim())
                      setOpen(false)
                      detailsButtonRef.current?.focus()
                    }}
                  >
                    {t.reaAnalyze}
                  </Button>
                </div>
                {mode === 'pure-conversation' ? <p>{t.reaModeHint}</p> : null}
                <details className="ai-rea-environment">
                  <summary>{t.reaEnvironment}</summary>
                  <p>{remote ? t.reaRemoteHint : t.reaLocalHint}</p>
                  <p>{t.reaWebHint}</p>
                  <p>{t.reaEngineHint}</p>
                </details>
              </div>
              <VerticalScrollbar ariaLabel={t.reaTitle} scrollRef={scrollRef} />
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
