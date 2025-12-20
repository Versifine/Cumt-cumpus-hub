type SkeletonProps = {
  count?: number
}

const boardWidths = ['78%', '64%', '70%', '60%', '74%']

export const BoardSkeletonList = ({ count = 4 }: SkeletonProps) => (
  <div className="skeleton-stack">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`board-skeleton-${index}`} className="skeleton-item">
        <div
          className="skeleton-line"
          style={{ width: boardWidths[index % boardWidths.length] }}
        />
        <div className="skeleton-line skeleton-line--short" />
      </div>
    ))}
  </div>
)

export const PostSkeletonList = ({ count = 4 }: SkeletonProps) => (
  <div className="skeleton-posts">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`post-skeleton-${index}`} className="skeleton-card">
        <div className="skeleton-line skeleton-line--wide" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-line--meta" />
      </div>
    ))}
  </div>
)
