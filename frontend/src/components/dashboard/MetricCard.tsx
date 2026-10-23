import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import styles from './MetricCard.module.css'

export type MetricCardProps = {
  label: string
  value: ReactNode
  detail?: ReactNode
  title?: string
  emphasis?: 'default' | 'lead'
}

export function MetricCard({ label, value, detail, title, emphasis = 'default' }: MetricCardProps) {
  return (
    <div className={styles.card} title={title}>
      <dt className="pm-eyebrow">{label}</dt>
      <dd className={cn(styles.value, emphasis === 'lead' && styles.lead)}>{value}</dd>
      {detail && <dd className={styles.detail}>{detail}</dd>}
    </div>
  )
}
