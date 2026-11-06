import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '../../../features/common/app-icon'
import './dropdown-select.css'

export type DropdownOption = {
  value: string
  label: string
  disabled?: boolean
}

// macOS 原生下拉框视觉已经足够好，且与系统语义一致；Windows / Linux 原生
// select 样式与主题脱节，因此仅在这两个平台走自绘 DropdownSelect。需要富内容
// 菜单的调用方可显式 forceCustomMenu，保证三端显示同一套菜单。
const useNativeSelect = () => window.transterm?.platform === 'darwin'

export function DropdownSelect({
  id,
  value,
  options,
  onChange,
  className,
  placeholder,
  disabled,
  autoFocus,
  menuWidth = 'trigger',
  menuPlacement = 'below',
  align = 'auto',
  onKeyDown,
  ariaLabel,
  renderOption,
  renderValue,
  menuClassName,
  forceCustomMenu = false,
  hideArrow = false
}: {
  id?: string
  value: string
  options: DropdownOption[]
  onChange(value: string): void
  className?: string
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  menuWidth?: 'trigger' | 'auto'
  menuPlacement?: 'above' | 'below' | 'auto'
  align?: 'left' | 'right' | 'auto'
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void
  ariaLabel?: string
  renderOption?: (option: DropdownOption, selected: boolean) => ReactNode
  renderValue?: (option: DropdownOption) => ReactNode
  menuClassName?: string
  forceCustomMenu?: boolean
  hideArrow?: boolean
}) {
  const nativeSelect = useNativeSelect() && !forceCustomMenu
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [arrowSize, setArrowSize] = useState(14)

  const selectedOption = options.find((option) => option.value === value)
  const selectedLabel = selectedOption?.label ?? placeholder ?? value

  useEffect(() => {
    const control = nativeSelect ? selectRef.current : triggerRef.current
    if (!control) return

    const updateArrowSize = () => {
      const controlHeight = control.getBoundingClientRect().height
      const nextSize = Math.max(12, Math.min(20, Math.round(controlHeight * 0.45)))
      setArrowSize((current) => (current === nextSize ? current : nextSize))
    }

    updateArrowSize()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(updateArrowSize)
    observer.observe(control)
    return () => observer.disconnect()
  }, [nativeSelect])

  const focusMenuItem = useCallback((direction: 'first' | 'last' | 'next' | 'previous') => {
    const menu = menuRef.current
    if (!menu) return
    const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if (!buttons.length) return
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? buttons.length - 1
          : direction === 'next'
            ? (Math.max(currentIndex, -1) + 1) % buttons.length
            : (currentIndex <= 0 ? buttons.length : currentIndex) - 1
    buttons[nextIndex]?.focus()
  }, [])

  const closeMenu = useCallback(() => {
    setOpen(false)
    const previousFocus = previousFocusRef.current
    if (previousFocus?.isConnected) {
      previousFocus.focus()
    }
  }, [])

  const toggleMenu = useCallback(() => {
    if (disabled) return
    if (open) {
      closeMenu()
    } else {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
  }, [disabled, open, closeMenu])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleEscape)
    const frame = window.requestAnimationFrame(() => focusMenuItem('first'))
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleEscape)
      window.cancelAnimationFrame(frame)
    }
  }, [open, closeMenu, focusMenuItem])

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const viewportMargin = 8
    // A previous open/options update may have applied a smaller viewport cap.
    // Read the stylesheet limit afresh so growing the window can expand again.
    menu.style.maxHeight = ''
    const maximumHeight = Number.parseFloat(getComputedStyle(menu).maxHeight) || 280
    const position = () => {
      const rect = trigger.getBoundingClientRect()
      menu.style.minWidth = menuWidth === 'trigger' ? `${Math.min(rect.width, window.innerWidth - 16)}px` : ''
      const above = Math.max(0, rect.top - viewportMargin - 4)
      const below = Math.max(0, window.innerHeight - rect.bottom - viewportMargin - 4)
      const desiredHeight = Math.min(maximumHeight, menu.scrollHeight + 2)
      const preferAbove = menuPlacement === 'above' || (menuPlacement === 'auto' && below < desiredHeight)
      const placeAbove = preferAbove ? above >= desiredHeight || above >= below : below < desiredHeight && above > below
      menu.style.maxHeight = `${Math.min(maximumHeight, placeAbove ? above : below)}px`
      const bounds = menu.getBoundingClientRect()
      const rightAligned =
        align === 'right' || (align === 'auto' && rect.left + bounds.width > window.innerWidth - viewportMargin)
      const left = rightAligned ? rect.right - bounds.width : rect.left
      menu.style.left = `${Math.max(viewportMargin, Math.min(left, window.innerWidth - bounds.width - viewportMargin))}px`
      menu.style.right = 'auto'
      const top = placeAbove ? rect.top - bounds.height - 4 : rect.bottom + 4
      menu.style.top = `${Math.max(viewportMargin, Math.min(top, window.innerHeight - bounds.height - viewportMargin))}px`
    }
    // Reposition the body portal when its anchor moves or rich options wrap.
    // Geometry stays in the DOM; no additional React layout commit is needed.
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    const observer = new ResizeObserver(position)
    observer.observe(trigger)
    observer.observe(menu)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      observer.disconnect()
    }
  }, [open, options, menuWidth, menuPlacement, align])

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    closeMenu()
  }

  if (nativeSelect) {
    return (
      <span className={`ft-select-shell ${className ?? ''}`.trim()}>
        <span className="ft-select-shell__value">
          {selectedOption && renderValue ? renderValue(selectedOption) : selectedLabel}
        </span>
        <select
          ref={selectRef}
          id={id}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {hideArrow ? null : <AppIcon className="ft-select-shell__icon" name="chevron-down" size={arrowSize} />}
      </span>
    )
  }

  const menuElement = (
    <div
      ref={menuRef}
      className={`context-menu dropdown-select-menu ${menuClassName ?? ''}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          focusMenuItem('next')
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          focusMenuItem('previous')
        } else if (event.key === 'Home') {
          event.preventDefault()
          focusMenuItem('first')
        } else if (event.key === 'End') {
          event.preventDefault()
          focusMenuItem('last')
        }
      }}
      role="menu"
      style={{ position: 'fixed' }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          className={`${option.value === value ? 'is-selected' : ''} ${renderOption ? 'has-custom-content' : ''}`.trim()}
          disabled={option.disabled}
          onClick={() => handleSelect(option.value)}
          role="menuitem"
          type="button"
        >
          {renderOption ? (
            renderOption(option, option.value === value)
          ) : (
            <>
              <span className="dropdown-select-check-slot">
                {option.value === value ? <AppIcon className="dropdown-select-check" name="check" size={14} /> : null}
              </span>
              <span className="dropdown-select-label">{option.label}</span>
            </>
          )}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={`dropdown-select-trigger ${className ?? ''}`.trim()}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggleMenu}
        onKeyDown={onKeyDown}
      >
        <span className="dropdown-select-value">
          {selectedOption && renderValue ? renderValue(selectedOption) : selectedLabel}
        </span>
        {hideArrow ? null : <AppIcon className="dropdown-select-arrow" name="chevron-down" size={arrowSize} />}
      </button>
      {open && typeof document !== 'undefined' ? createPortal(menuElement, document.body) : null}
    </>
  )
}
