import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { Pagination } from './Pagination'
import { SearchField } from './SearchField'
import { FilterChips } from './FilterChips'
import { FilterSelect } from './FilterSelect'
import { ModelBadge } from './ModelBadge'

describe('SearchField', () => {
  it('reports typed values, clears, and announces the result count', async () => {
    const onChange = vi.fn()
    const onClear = vi.fn()
    const { user } = renderWithProviders(
      <SearchField value="parser" onChange={onChange} onClear={onClear} resultCount={4} />,
    )

    const input = screen.getByRole('searchbox', { name: 'Filter sessions' })
    expect(input).toHaveValue('parser')
    expect(screen.getByRole('status')).toHaveTextContent('4 sessions match')

    await user.type(input, 'x')
    expect(onChange).toHaveBeenLastCalledWith('parserx')

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('focuses the field with "/" but not while typing in another input', async () => {
    const { user } = renderWithProviders(
      <>
        <input aria-label="Other" />
        <SearchField value="" onChange={vi.fn()} onClear={vi.fn()} />
      </>,
    )

    const search = screen.getByRole('searchbox', { name: 'Filter sessions' })
    await user.click(document.body)
    await user.keyboard('/')
    expect(search).toHaveFocus()

    await user.click(screen.getByRole('textbox', { name: 'Other' }))
    await user.keyboard('/')
    expect(screen.getByRole('textbox', { name: 'Other' })).toHaveFocus()
    expect(search).not.toHaveFocus()
  })

  it('clears on Escape and omits the clear button when empty', async () => {
    const onClear = vi.fn()
    const { user } = renderWithProviders(
      <SearchField value="" onChange={vi.fn()} onClear={onClear} />,
    )
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Filter sessions' }), '{Escape}')
    expect(onClear).toHaveBeenCalled()
  })
})

describe('FilterSelect', () => {
  it('is labelled and emits the selected value', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <FilterSelect
        label="Project"
        value=""
        options={[
          { value: '', label: 'All projects' },
          { value: '/work/alpha', label: 'alpha (1)' },
        ]}
        onChange={onChange}
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Project' })
    await user.selectOptions(select, '/work/alpha')
    expect(onChange).toHaveBeenCalledWith('/work/alpha')
  })
})

describe('FilterChips', () => {
  it('renders removable chips and a clear-all action', async () => {
    const onRemove = vi.fn()
    const onClearAll = vi.fn()
    const { user } = renderWithProviders(
      <FilterChips
        chips={[{ key: 'cwd', label: 'Project', value: 'alpha', onRemove }]}
        onClearAll={onClearAll}
      />,
    )

    expect(screen.getByRole('group', { name: 'Active filters' })).toBeInTheDocument()
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Project filter' }))
    expect(onRemove).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it('renders nothing without chips', () => {
    const { container } = renderWithProviders(<FilterChips chips={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ModelBadge', () => {
  it('shows the model, an extra count and the full model list title', () => {
    renderWithProviders(
      <ModelBadge model="claude-sonnet-4-5" extraCount={2} title="one, two, three" />,
    )
    const badge = screen.getByText('claude-sonnet-4-5 +2')
    expect(badge).toHaveAttribute('title', 'one, two, three')
  })
})

describe('Pagination', () => {
  it('reports the visible window and navigates pages', async () => {
    const onPage = vi.fn()
    const onPageSize = vi.fn()
    const { user } = renderWithProviders(
      <Pagination
        page={2}
        totalPages={4}
        total={100}
        pageSize={25}
        onPage={onPage}
        onPageSize={onPageSize}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Sessions pagination' })).toBeInTheDocument()
    expect(screen.getByText('26–50 of 100')).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onPage).toHaveBeenCalledWith(1)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPage).toHaveBeenCalledWith(3)

    await user.selectOptions(screen.getByRole('combobox'), '50')
    expect(onPageSize).toHaveBeenCalledWith(50)
  })

  it('disables navigation at the boundaries and while loading', () => {
    const { unmount } = renderWithProviders(
      <Pagination
        page={1}
        totalPages={1}
        total={0}
        pageSize={25}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
      />,
    )
    expect(screen.getByText('No sessions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    unmount()

    renderWithProviders(
      <Pagination
        page={2}
        totalPages={4}
        total={100}
        pageSize={25}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
        isLoading
      />,
    )
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('clamps an invalid total-pages value', () => {
    renderWithProviders(
      <Pagination
        page={1}
        totalPages={0}
        total={3}
        pageSize={25}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
      />,
    )
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation')).getByText('1–3 of 3')).toBeInTheDocument()
  })
})
