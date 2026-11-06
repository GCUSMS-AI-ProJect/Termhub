import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactElement } from 'react'
import { createPortal } from 'react-dom'
import './tooltip.css'

export function Tooltip({
  label,
  description,
  disabled = false,
  children
}: {
  label: string
  description?: string
  disabled?: boolean
  children: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissedRef = useRef(false)
  const visible = open && !disabled
  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const show = (delay: number) => {
    clearTimer()
    if (!dismissedRef.current && !disabled) timerRef.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    clearTimer()
    setOpen(false)
  }
  const leave = () => {
    clearTimer()
    dismissedRef.current = false
    if (!anchorRef.current?.contains(document.activeElement)) timerRef.current = setTimeout(() => setOpen(false), 120)
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  useLayoutEffect(() => {
    if (!visible) return
    const position = () => {
      const anchor = anchorRef.current?.getBoundingClientRect()
      const tooltip = tooltipRef.current
      if (!anchor || !tooltip) return
      const bounds = tooltip.getBoundingClientRect()
      const left = Math.max(12, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 12))
      const above = anchor.top - bounds.height - 8
      const top = above >= 12 ? above : anchor.bottom + 8
      tooltip.style.left = `${left}px`
      tooltip.style.top = `${Math.max(12, Math.min(top, window.innerHeight - bounds.height - 12))}px`
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    const observer = new ResizeObserver(position)
    if (tooltipRef.current) observer.observe(tooltipRef.current)
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      dismissedRef.current = true
      setOpen(false)
    }
    document.addEventListener('keydown', dismiss)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      document.removeEventListener('keydown', dismiss)
      observer.disconnect()
    }
  }, [visible])

  return (
    <span
      ref={anchorRef}
      className="ft-tooltip-anchor"
      onMouseEnter={() => {
        dismissedRef.current = false
        show(350)
      }}
      onMouseLeave={leave}
      onFocus={() => show(0)}
      onBlur={leave}
      onPointerDown={() => {
        dismissedRef.current = true
        hide()
      }}
      onClick={hide}
    >
      {cloneElement(children, {
        'aria-describedby':
          [children.props['aria-describedby'], visible ? id : undefined].filter(Boolean).join(' ') || undefined
      })}
      {visible
        ? createPortal(
            <div
              ref={tooltipRef}
              id={id}
              role="tooltip"
              className="ft-tooltip"
              onMouseEnter={clearTimer}
              onMouseLeave={leave}
            >
              <span className="ft-tooltip-label">{label}</span>
              {description ? <span className="ft-tooltip-description">{description}</span> : null}
            </div>,
            document.body
          )
        : null}
    </span>
  )
}
