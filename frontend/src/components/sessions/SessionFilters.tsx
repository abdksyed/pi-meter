import type { FiltersResponse } from '../../lib/api.types'
import type { RangeKey } from '../../lib/dateRange'
import { projectSlug } from '../../lib/format'
import { DateRangeSelector } from '../dashboard/DateRangeSelector'
import { FilterChips } from './FilterChips'
import type { FilterChip } from './FilterChips'
import { FilterSelect } from './FilterSelect'
import { SearchField } from './SearchField'
import styles from './SessionFilters.module.css'

export type SessionFiltersProps = {
  range: RangeKey
  from?: string
  to?: string
  cwd?: string
  model?: string
  searchInput: string
  minCost?: string
  filtersData?: FiltersResponse
  resultCount?: number
  hasFilters: boolean
  onChangeRange: (range: RangeKey) => void
  onChangeCustomRange: (from: string, to: string) => void
  onChangeCwd: (cwd?: string) => void
  onChangeModel: (model?: string) => void
  onChangeSearch: (value: string) => void
  onClearSearch: () => void
  onChangeMinCost: (value?: string) => void
  onClearFilters: () => void
}

export function SessionFilters({
  range,
  from,
  to,
  cwd,
  model,
  searchInput,
  minCost,
  filtersData,
  resultCount,
  hasFilters,
  onChangeRange,
  onChangeCustomRange,
  onChangeCwd,
  onChangeModel,
  onChangeSearch,
  onClearSearch,
  onChangeMinCost,
  onClearFilters,
}: SessionFiltersProps) {
  const projectOptions = [
    { value: '', label: 'All projects' },
    ...(filtersData?.workingDirectories ?? []).map((directory) => ({
      value: directory.cwd,
      label:
        directory.sessionCount > 0
          ? `${projectSlug(directory.cwd)} (${directory.sessionCount})`
          : projectSlug(directory.cwd),
    })),
  ]

  const modelOptions = [
    { value: '', label: 'All models' },
    ...(filtersData?.models ?? []).map((item) => ({
      value: item.model,
      label:
        item.sessionCount > 0 ? `${item.model} (${item.sessionCount})` : item.model,
    })),
  ]

  if (cwd && !projectOptions.some((option) => option.value === cwd)) {
    projectOptions.push({ value: cwd, label: projectSlug(cwd) })
  }
  if (model && !modelOptions.some((option) => option.value === model)) {
    modelOptions.push({ value: model, label: model })
  }

  const chips: FilterChip[] = [
    ...(cwd
      ? [
          {
            key: 'cwd',
            label: 'Project',
            value: projectSlug(cwd),
            onRemove: () => onChangeCwd(undefined),
          },
        ]
      : []),
    ...(model
      ? [
          {
            key: 'model',
            label: 'Model',
            value: model,
            onRemove: () => onChangeModel(undefined),
          },
        ]
      : []),
    ...(searchInput
      ? [
          {
            key: 'q',
            label: 'Search',
            value: searchInput,
            onRemove: onClearSearch,
          },
        ]
      : []),
    ...(minCost
      ? [
          {
            key: 'minCost',
            label: 'Min cost',
            value: `≥ ${minCost}`,
            onRemove: () => onChangeMinCost(undefined),
          },
        ]
      : []),
  ]

  const dateBounds = filtersData?.dateBounds

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <DateRangeSelector
          variant="compact"
          range={range}
          from={from}
          to={to}
          onChange={onChangeRange}
          onCustomRange={onChangeCustomRange}
          min={dateBounds?.minStartedAt?.slice(0, 10)}
          max={dateBounds?.maxLastActivityAt?.slice(0, 10)}
        />
        <FilterSelect
          label="Project"
          value={cwd ?? ''}
          options={projectOptions}
          onChange={(value) => onChangeCwd(value || undefined)}
        />
        <FilterSelect
          label="Model"
          value={model ?? ''}
          options={modelOptions}
          onChange={(value) => onChangeModel(value || undefined)}
        />
        <SearchField
          value={searchInput}
          onChange={onChangeSearch}
          onClear={onClearSearch}
          resultCount={resultCount}
        />
        <details className={styles.more}>
          <summary className={styles.moreSummary}>More filters</summary>
          <div className={styles.morePanel}>
            <label className={styles.moreLabel} htmlFor="min-cost">
              Minimum cost
              <input
                id="min-cost"
                className="pm-field"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={minCost ?? ''}
                placeholder="0.00"
                onChange={(event) => onChangeMinCost(event.target.value || undefined)}
              />
            </label>
          </div>
        </details>
      </div>

      {hasFilters && <FilterChips chips={chips} onClearAll={onClearFilters} />}
    </div>
  )
}
