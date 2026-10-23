import { useId } from 'react'
import styles from './FilterSelect.module.css'

export type FilterOption = {
  value: string
  label: string
}

export type FilterSelectProps = {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}

export function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const id = useId()

  return (
    <div className={styles.root}>
      <label className="pm-visually-hidden" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={`pm-field ${styles.select}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg className={styles.chevron} viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M2.5 4.5L6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
