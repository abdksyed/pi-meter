import type { ReactNode } from 'react'

export type PanelStateStatus = 'loading' | 'error' | 'empty' | 'ready'

export type PanelStateProps = {
  status: PanelStateStatus
  children?: ReactNode
  skeleton?: ReactNode
  empty?: ReactNode
  error?: ReactNode
}

/** Picks the right state for a panel body so every panel behaves the same way. */
export function PanelState({ status, children, skeleton, empty, error }: PanelStateProps) {
  if (status === 'loading') return <>{skeleton ?? <SkeletonFallback />}</>
  if (status === 'error') return <>{error}</>
  if (status === 'empty') return <>{empty}</>
  return <>{children}</>
}

function SkeletonFallback() {
  return (
    <div className="pm-skeleton-group" aria-hidden="true">
      <span className="pm-skeleton" style={{ height: 14, width: '45%' }} />
      <span className="pm-skeleton" style={{ height: 14, width: '80%' }} />
      <span className="pm-skeleton" style={{ height: 14, width: '65%' }} />
    </div>
  )
}
