import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type PanelProps = {
  title?: ReactNode
  eyebrow?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
  labelledBy?: string
}

/** Flat white surface with a hairline border and an optional heading row. */
export function Panel({
  title,
  eyebrow,
  meta,
  actions,
  footer,
  children,
  className,
  bodyClassName,
  id,
  labelledBy,
}: PanelProps) {
  const hasHeader = Boolean(title || eyebrow || meta || actions)

  return (
    <section className={cn('pm-panel', className)} id={id} aria-labelledby={labelledBy}>
      {hasHeader && (
        <header className="pm-panel__header">
          <div className="pm-panel__heading">
            {eyebrow && <p className="pm-eyebrow">{eyebrow}</p>}
            {title && <h2 className="pm-panel__title">{title}</h2>}
          </div>
          {meta && <p className="pm-panel__meta pm-mono">{meta}</p>}
          {actions && <div className="pm-panel__actions">{actions}</div>}
        </header>
      )}
      <div className={cn('pm-panel__body', bodyClassName)}>{children}</div>
      {footer && <footer className="pm-panel__footer">{footer}</footer>}
    </section>
  )
}
