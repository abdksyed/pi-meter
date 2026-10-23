import type { ReactNode } from 'react'

export type EmptyStateProps = {
  title: string
  eyebrow?: string
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, eyebrow, description, action }: EmptyStateProps) {
  return (
    <div className="pm-empty">
      {eyebrow && <p className="pm-eyebrow">{eyebrow}</p>}
      <p className="pm-empty__title">{title}</p>
      {description && <p className="pm-empty__body">{description}</p>}
      {action && <div className="pm-empty__action">{action}</div>}
    </div>
  )
}
