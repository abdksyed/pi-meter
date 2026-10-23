import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import type { RangeKey } from '../../lib/dateRange'
import { RANGE_OPTIONS, isValidCustomRange, rangeLabel } from '../../lib/dateRange'
import styles from './DateRangeSelector.module.css'

export type DateRangeSelectorProps = {
  range: RangeKey
  from?: string
  to?: string
  onChange: (range: RangeKey) => void
  onCustomRange: (from: string, to: string) => void
  variant?: 'segmented' | 'compact'
  min?: string
  max?: string
}

function isoToday(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function isoDaysAgo(days: number): string {
  const now = new Date()
  now.setDate(now.getDate() - days)
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function DateRangeSelector({
  range,
  from,
  to,
  onChange,
  onCustomRange,
  variant = 'segmented',
  min,
  max,
}: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(from ?? isoDaysAgo(7))
  const [draftTo, setDraftTo] = useState(to ?? isoToday())
  const containerRef = useRef<HTMLDivElement>(null)
  const selectId = useId()

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isOpen])

  const openCustom = () => {
    setDraftFrom(from ?? isoDaysAgo(7))
    setDraftTo(to ?? isoToday())
    setIsOpen(true)
  }

  const applyCustom = () => {
    if (!isValidCustomRange(draftFrom, draftTo)) return
    onCustomRange(draftFrom, draftTo)
    setIsOpen(false)
  }

  const isCustomValid = isValidCustomRange(draftFrom, draftTo)

  return (
    <div className={cn(styles.root, variant === 'compact' && styles.compact)} ref={containerRef}>
      {variant === 'compact' ? (
        <select
          id={selectId}
          className={cn('pm-field', styles.select)}
          aria-label="Date range"
          value={isOpen ? 'custom' : range}
          onChange={(event) => {
            const value = event.target.value as RangeKey
            if (value === 'custom') {
              openCustom()
              return
            }
            setIsOpen(false)
            onChange(value)
          }}
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === 'today'
                ? 'Today'
                : option.value === '7d'
                  ? 'Last 7 days'
                  : option.value === '30d'
                    ? 'Last 30 days'
                    : option.label}
            </option>
          ))}
          <option value="custom">
            {range === 'custom' ? rangeLabel(range, from, to) : 'Custom range…'}
          </option>
        </select>
      ) : (
        <div className={styles.segmented} role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(styles.segment, range === option.value && styles.active)}
              aria-pressed={range === option.value}
              onClick={() => {
                setIsOpen(false)
                onChange(option.value)
              }}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            className={cn(
              styles.segment,
              range === 'custom' && styles.active,
              isOpen && styles.open,
            )}
            aria-pressed={range === 'custom'}
            aria-expanded={isOpen}
            onClick={() => (isOpen ? setIsOpen(false) : openCustom())}
          >
            {range === 'custom' ? rangeLabel(range, from, to) : 'Custom'}
          </button>
        </div>
      )}

      {isOpen && (
        <div
          className={styles.customPanel}
          role="dialog"
          aria-label="Custom date range"
          aria-modal="false"
        >
          <div className={styles.customFields}>
            <label className={styles.customLabel} htmlFor={`${selectId}-from`}>
              From
              <input
                id={`${selectId}-from`}
                className="pm-field"
                type="date"
                autoFocus
                value={draftFrom}
                min={min}
                max={draftTo || max}
                onChange={(event) => setDraftFrom(event.target.value)}
              />
            </label>
            <label className={styles.customLabel} htmlFor={`${selectId}-to`}>
              To
              <input
                id={`${selectId}-to`}
                className="pm-field"
                type="date"
                value={draftTo}
                min={draftFrom || min}
                max={max}
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </label>
          </div>
          {!isCustomValid && (
            <p className={styles.customError} role="alert">
              From must be on or before To.
            </p>
          )}
          <div className={styles.customActions}>
            <button
              type="button"
              className="pm-btn pm-btn--primary"
              onClick={applyCustom}
              disabled={!isCustomValid}
            >
              Apply
            </button>
            <button type="button" className="pm-btn" onClick={() => setIsOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
