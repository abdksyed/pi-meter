import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { DateRangeSelector } from './DateRangeSelector'

function setup(overrides: Partial<React.ComponentProps<typeof DateRangeSelector>> = {}) {
  const onChange = vi.fn()
  const onCustomRange = vi.fn()
  const view = renderWithProviders(
    <DateRangeSelector
      range="7d"
      onChange={onChange}
      onCustomRange={onCustomRange}
      {...overrides}
    />,
  )
  return { ...view, onChange, onCustomRange }
}

describe('DateRangeSelector (segmented)', () => {
  it('marks the active preset and emits preset changes', async () => {
    const { user, onChange } = setup()

    expect(screen.getByRole('group', { name: 'Date range' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: '30 days' }))
    expect(onChange).toHaveBeenCalledWith('30d')
  })

  it('opens the custom dialog, validates order and applies the range', async () => {
    const { user, onChange, onCustomRange } = setup()

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Custom date range' })
    expect(dialog).toBeInTheDocument()

    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    await user.clear(from)
    await user.type(from, '2026-01-10')
    await user.clear(to)
    await user.type(to, '2026-01-05')

    expect(screen.getByRole('alert')).toHaveTextContent('From must be on or before To.')
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(onCustomRange).not.toHaveBeenCalled()

    await user.clear(to)
    await user.type(to, '2026-01-15')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onCustomRange).toHaveBeenCalledWith('2026-01-10', '2026-01-15')
    expect(dialog).not.toBeInTheDocument()
    // Choosing a custom range must not fire a preset change.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes the custom dialog on Escape and on Cancel without applying', async () => {
    const { user, onCustomRange } = setup()

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onCustomRange).not.toHaveBeenCalled()
  })

  it('labels an active custom range with its dates', () => {
    setup({ range: 'custom', from: '2026-01-01', to: '2026-01-15' })
    expect(screen.getByRole('button', { name: /Jan 1 .* Jan 15/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('renders a labelled select in compact mode', async () => {
    const { user, onChange } = setup({ variant: 'compact' })

    const select = screen.getByRole('combobox', { name: 'Date range' })
    expect(select).toHaveValue('7d')
    expect(screen.getByRole('option', { name: 'Last 7 days' })).toBeInTheDocument()

    await user.selectOptions(select, 'today')
    expect(onChange).toHaveBeenCalledWith('today')
  })

  it('opens the custom dialog from the compact select', async () => {
    const { user } = setup({ variant: 'compact' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), 'custom')
    expect(screen.getByRole('dialog', { name: 'Custom date range' })).toBeInTheDocument()
  })
})
