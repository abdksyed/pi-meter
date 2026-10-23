import styles from './FilterChips.module.css'

export type FilterChip = {
  key: string
  label: string
  value: string
  onRemove: () => void
}

export type FilterChipsProps = {
  chips: FilterChip[]
  onClearAll?: () => void
}

export function FilterChips({ chips, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null

  return (
    <div className={styles.root} role="group" aria-label="Active filters">
      {chips.map((chip) => (
        <span className={styles.chip} key={chip.key}>
          <span className={styles.label}>{chip.label}</span>
          <span className={styles.value} title={chip.value}>
            {chip.value}
          </span>
          <button
            type="button"
            className={styles.remove}
            onClick={chip.onRemove}
            aria-label={`Remove ${chip.label} filter`}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M3 3l6 6M9 3l-6 6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
      {onClearAll && (
        <button type="button" className={styles.clear} onClick={onClearAll}>
          Clear all
        </button>
      )}
    </div>
  )
}
