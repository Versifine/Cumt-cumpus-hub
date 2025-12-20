type ErrorStateProps = {
  message: string
  onRetry?: () => void
}

type EmptyStateProps = {
  title: string
  description?: string
}

export const ErrorState = ({ message, onRetry }: ErrorStateProps) => (
  <div className="status-block status-error">
    <div className="status-title">Something went wrong</div>
    <div className="status-message">{message}</div>
    {onRetry ? (
      <button type="button" className="retry-button" onClick={onRetry}>
        жиЪд
      </button>
    ) : null}
  </div>
)

export const EmptyState = ({ title, description }: EmptyStateProps) => (
  <div className="status-block status-empty">
    <div className="status-title">{title}</div>
    {description ? <div className="status-message">{description}</div> : null}
  </div>
)
