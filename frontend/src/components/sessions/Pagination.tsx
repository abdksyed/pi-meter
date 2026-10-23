import styles from './Pagination.module.css'

export type PaginationProps = {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: 25 | 50 | 100) => void
  isLoading?: boolean
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
  isLoading,
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages)
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  return (
    <nav className={styles.root} aria-label="Sessions pagination">
      <p className={styles.range}>
        {total === 0 ? 'No sessions' : `${first}–${last} of ${total}`}
      </p>
      <div className={styles.controls}>
        <label className={styles.pageSize}>
          <span className={styles.pageSizeLabel}>Per page</span>
          <select
            className={styles.select}
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value) as 25 | 50 | 100)}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button
          type="button"
          className="pm-btn pm-btn--icon"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || isLoading}
          aria-label="Previous page"
        >
          <svg className="pm-btn__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className={styles.pageCount} aria-live="polite">
          {page} / {safeTotalPages}
        </span>
        <button
          type="button"
          className="pm-btn pm-btn--icon"
          onClick={() => onPage(page + 1)}
          disabled={page >= safeTotalPages || isLoading}
          aria-label="Next page"
        >
          <svg className="pm-btn__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 3l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </nav>
  )
}
