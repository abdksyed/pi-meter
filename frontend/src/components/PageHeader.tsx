import type { ReactNode } from 'react'

export type PageHeaderProps = {
  title: string
  count?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, count, meta, actions }: PageHeaderProps) {
  return (
    <header className="pm-page-header">
      <div>
        <div className="pm-page-header__title-row">
          <h1 className="pm-page-title">{title}</h1>
          {count !== undefined && count !== null && <span className="pm-badge">{count}</span>}
        </div>
        {meta && <p className="pm-page-header__meta pm-mono">{meta}</p>}
      </div>
      {actions && <div className="pm-page-header__actions">{actions}</div>}
    </header>
  )
}
