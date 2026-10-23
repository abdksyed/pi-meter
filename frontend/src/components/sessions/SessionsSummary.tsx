import type { ProjectBreakdownRow, SessionsResponse, SummaryResponse } from '../../lib/api.types'
import { projectColor } from '../../lib/chartColors'
import {
  formatCost,
  formatCostExact,
  formatPercent,
  formatTokens,
  formatTokensExact,
  projectSlug,
} from '../../lib/format'
import { Skeleton } from '../Skeleton'
import styles from './SessionsSummary.module.css'

export type SessionsSummaryProps = {
  data?: SessionsResponse
  summary?: SummaryResponse
  projects?: ProjectBreakdownRow[]
  rangeLabel: string
  cwd?: string
  isLoading?: boolean
}

export function SessionsSummary({
  data,
  summary,
  projects,
  rangeLabel,
  cwd,
  isLoading,
}: SessionsSummaryProps) {
  const totals = summary
    ? {
        sessionCount: summary.sessionCount,
        costTotal: summary.costTotal,
        totalTokens: summary.totalTokens,
        averageSessionCost: summary.averageSessionCost,
      }
    : data?.totals
  const allProjects = projects ?? []
  const topProjects = [...allProjects].sort((a, b) => b.costTotal - a.costTotal).slice(0, 4)
  const projectTotal = allProjects.reduce((sum, project) => sum + project.costTotal, 0)

  return (
    <aside className={styles.root} aria-label="Sessions summary">
      <section className={`pm-panel ${styles.card}`} aria-label={`${rangeLabel} totals`}>
        <div className={styles.cardBody}>
          {isLoading || !totals ? (
            <>
              <Skeleton lines={1} height={10} width="40%" />
              <Skeleton lines={1} height={44} width="70%" />
              <Skeleton lines={2} height={12} />
            </>
          ) : (
            <>
              <p className="pm-eyebrow">{rangeLabel} total</p>
              <p className={styles.total} title={formatCostExact(totals.costTotal)}>
                {formatCost(totals.costTotal)}
              </p>
              <p className={styles.annotation}>
                {formatTokens(totals.totalTokens)} tokens across{' '}
                {totals.sessionCount.toLocaleString()}{' '}
                {totals.sessionCount === 1 ? 'session' : 'sessions'}
              </p>

              <div className={styles.divider} />

              <p className={styles.subhead}>Cost by project</p>
              {topProjects.length === 0 ? (
                <p className={styles.muted}>No project cost in this range.</p>
              ) : (
                <ul className={styles.projectList}>
                  {topProjects.map((project) => {
                    const share = projectTotal > 0 ? project.costTotal / projectTotal : 0
                    return (
                      <li key={project.cwd} className={styles.project}>
                        <span className={styles.projectTop}>
                          <span className={styles.projectName} title={project.cwd}>
                            {projectSlug(project.cwd)}
                          </span>
                          <span
                            className={styles.projectValue}
                            title={`${formatCostExact(project.costTotal)} · ${formatTokensExact(project.totalTokens)} tokens`}
                          >
                            {formatCost(project.costTotal)} ({formatPercent(share)})
                          </span>
                        </span>
                        <span className={styles.track} aria-hidden="true">
                          <span
                            className={styles.fill}
                            style={{
                              width: `${share * 100}%`,
                              backgroundColor: projectColor(project.cwd),
                            }}
                          />
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {cwd && (
                <p className={styles.note}>
                  Filtered to <span className={styles.noteMono}>{projectSlug(cwd)}</span>
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section className={`pm-panel ${styles.card}`} aria-label="Average per session">
        <div className={styles.cardBody}>
          <p className="pm-eyebrow">Average per session</p>
          {isLoading || !totals ? (
            <Skeleton lines={1} height={32} width="60%" />
          ) : (
            <p className={styles.average} title={formatCostExact(totals.averageSessionCost)}>
              {formatCost(totals.averageSessionCost)}
            </p>
          )}
        </div>
      </section>
    </aside>
  )
}
