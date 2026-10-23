export type ErrorStateProps = {
  title?: string
  message?: string
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({
  title = 'Could not load this data',
  message,
  onRetry,
  retryLabel = 'Retry',
}: ErrorStateProps) {
  return (
    <div className="pm-error" role="alert">
      <p className="pm-eyebrow">Error</p>
      <p className="pm-error__title">{title}</p>
      {message && <p className="pm-error__message pm-mono">{message}</p>}
      {onRetry && (
        <button type="button" className="pm-btn" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  )
}
