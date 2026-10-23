import { cn } from '../lib/cn'

export type SkeletonProps = {
  lines?: number
  height?: number | string
  width?: string
  className?: string
}

/** Static placeholder block. No shimmer. */
export function Skeleton({ lines = 1, height = 12, width = '100%', className }: SkeletonProps) {
  return (
    <div className={cn('pm-skeleton-group', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="pm-skeleton"
          style={{
            height,
            width: lines > 1 && index === lines - 1 ? '60%' : width,
          }}
        />
      ))}
    </div>
  )
}
