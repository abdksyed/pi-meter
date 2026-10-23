import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../test/helpers'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  it('renders the placeholder route with a heading and explanation', () => {
    renderWithProviders(<SettingsPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Local index configuration')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Placeholder')).toBeInTheDocument()
    expect(screen.getByText('Settings are not built yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Sessions directory, database location, and index diagnostics belong on this route.',
      ),
    ).toBeInTheDocument()
  })

  it('does not make configuration controls look available', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
