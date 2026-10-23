import { useEffect, useRef } from 'react'
import styles from './SearchField.module.css'

export type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  resultCount?: number
  placeholder?: string
}

export function SearchField({
  value,
  onChange,
  onClear,
  resultCount,
  placeholder = 'Filter by session title, cwd, or ID…',
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={styles.root}>
      <svg className={styles.icon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <label className="pm-visually-hidden" htmlFor="session-search">
        Filter sessions
      </label>
      <input
        ref={inputRef}
        id="session-search"
        className={`pm-field ${styles.input}`}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClear()
          }
        }}
      />
      {value && (
        <button type="button" className={styles.clear} onClick={onClear} aria-label="Clear search">
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
      <span className="pm-visually-hidden" role="status" aria-live="polite">
        {resultCount === undefined ? '' : `${resultCount} sessions match`}
      </span>
    </div>
  )
}
