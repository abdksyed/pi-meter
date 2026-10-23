import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import {
  SESSION_IDS,
  SUMMARY_COST_TOTAL,
  SUMMARY_TOKENS,
  SUMMARY_TOTAL_TOKENS,
  normalizedSessionDetailFixture,
} from '../../test/fixtures'
import type { NormalizedSession } from '../../lib/sessionTypes'
import { SessionTotalsRail } from './SessionTotalsRail'
import { SessionCostPanel } from './SessionCostPanel'
import { SessionHeader } from './SessionHeader'
import { ParseWarningsBanner } from './ParseWarningsBanner'
import { SessionDetailSkeleton } from './SessionDetailSkeleton'

const detail = normalizedSessionDetailFixture()
const session = detail.session

function sessionWith(overrides: Partial<NormalizedSession> = {}): NormalizedSession {
  return { ...session, ...overrides }
}

describe('SessionTotalsRail', () => {
  it('orders its sections exactly as the product requires', () => {
    renderWithProviders(
      <SessionTotalsRail
        session={session}
        relatedSessions={detail.relatedSessions}
        relatedCostTotal={detail.relatedCostTotal}
        combinedCostTotal={detail.combinedCostTotal}
      />,
    )

    const rail = screen.getByRole('complementary', { name: 'Session totals' })
    const headings = within(rail)
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent?.replace(/\s+/g, ' ').trim())

    expect(headings).toEqual([
      'Cumulative cost USD',
      'Token composition',
      'Cost & volume breakdown',
      'Execution telemetry',
      'Models',
      'Source file',
    ])

    // Sub-agents live between Models and Source file.
    const subAgents = within(rail).getByText('Sub-agent sessions')
    const models = within(rail).getByRole('heading', { name: 'Models' })
    const source = within(rail).getByRole('heading', { name: 'Source file' })
    expect(models.compareDocumentPosition(subAgents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(source.compareDocumentPosition(subAgents) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('shows own cost, related cost and the combined cumulative cost', () => {
    renderWithProviders(
      <SessionTotalsRail
        session={session}
        relatedSessions={detail.relatedSessions}
        relatedCostTotal={detail.relatedCostTotal}
        combinedCostTotal={detail.combinedCostTotal}
      />,
    )

    // Own session cost stays at the recorded $0.019409 even with children.
    expect(screen.getByRole('heading', { name: /Cumulative cost/ })).toHaveTextContent(
      'Cumulative cost USD',
    )
    // Own cost is the recorded session total, never combined with children.
    // It appears in the cumulative block and the breakdown table total row.
    expect(screen.getAllByText('$0.0194').length).toBe(2)
    // 0.02 related + 0.039409 combined, in 4-decimal presentation.
    expect(screen.getByText('$0.0200 sub-agent cost · $0.0394 combined')).toBeInTheDocument()
    expect(screen.getByText('10,725 tok')).toBeInTheDocument()
  })

  it('omits the related-cost line when a session has no sub-agents', () => {
    renderWithProviders(<SessionTotalsRail session={session} relatedSessions={[]} />)
    expect(screen.queryByText(/sub-agent cost/)).not.toBeInTheDocument()
    expect(screen.queryByText('Sub-agent sessions')).not.toBeInTheDocument()
    // No children means no invented "sub-agent calls" count above zero.
    const telemetry = screen.getByText('Sub-agent calls').parentElement as HTMLElement
    expect(within(telemetry).getByText('0')).toBeInTheDocument()
  })

  it('renders token composition and the breakdown table from the session totals', () => {
    renderWithProviders(<SessionTotalsRail session={session} />)

    const meter = screen.getByRole('img', { name: 'Token composition' })
    expect(meter).toBeInTheDocument()

    const legend = meter.nextElementSibling as HTMLElement
    expect(within(legend).getByText('Input').closest('li')).toHaveTextContent('4,210')
    expect(within(legend).getByText('Reasoning').closest('li')).toHaveTextContent('2.4%')

    const table = screen.getByRole('table', { name: 'Cost and token volume breakdown' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(7)
    // Reasoning has a token count but no invented separately billed cost.
    const reasoningRow = within(table).getByRole('rowheader', { name: 'Reasoning' }).closest('tr')!
    expect(within(reasoningRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '260',
      '—',
    ])
    const totalRow = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')!
    expect(within(totalRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '10,725',
      '$0.0194',
    ])
  })

  it('reports execution telemetry counts, including sub-agent calls as mapped children', () => {
    renderWithProviders(
      <SessionTotalsRail session={session} relatedSessions={detail.relatedSessions} />,
    )

    const telemetry = screen.getByText('Tool calls').closest('dl') as HTMLElement
    expect(within(telemetry).getByText('Duration').nextElementSibling).toHaveTextContent('2m 40s')
    expect(within(telemetry).getByText('Tool calls').nextElementSibling).toHaveTextContent('1')
    expect(within(telemetry).getByText('Tool results').nextElementSibling).toHaveTextContent('1')
    expect(within(telemetry).getByText('Model changes').nextElementSibling).toHaveTextContent('1')
    // Known gap: this label currently mirrors the mapped-children count, not the
    // number of real sub-agent invocations.
    expect(within(telemetry).getByText('Sub-agent calls').nextElementSibling).toHaveTextContent(
      '1',
    )
  })

  // Requirement (test_plan.md, relationship regressions): the number of mapped
  // child sessions is not the number of sub-agent invocations. The fixture below
  // has one tool call but five mapped children, so the true invocation count is
  // at most one (the API exposes no invocation count yet). This is known defect
  // D5: `Execution telemetry > Sub-agent calls` currently prints the child count.
  it('reports sub-agent calls rather than mapped child sessions (known defect D5)', () => {
    const related = Array.from({ length: 5 }, (_, index) => ({
      sessionId: `child-${index}`,
      title: `Child ${index}`,
      costTotal: 0.02,
      totalTokens: 150,
    }))
    renderWithProviders(
      <SessionTotalsRail
        session={sessionWith({ counts: { ...session.counts, toolCalls: 1 } })}
        relatedSessions={related}
        relatedCostTotal={0.1}
      />,
    )

    const telemetry = screen.getByText('Sub-agent calls').closest('dl') as HTMLElement
    expect(within(telemetry).getByText('Tool calls').nextElementSibling).toHaveTextContent('1')
    expect(within(telemetry).getByText('Sub-agent calls').nextElementSibling).toHaveTextContent(
      /^1$/,
    )
  })

  it('lists model names with per-model tokens and cost', () => {
    renderWithProviders(
      <SessionTotalsRail
        session={sessionWith({
          models: [
            { model: 'claude-sonnet-4-5', provider: 'anthropic', totalTokens: 6040, cost: 0.01097 },
            { model: 'gpt-5.1', provider: 'openai', totalTokens: 165 },
          ],
        })}
      />,
    )
    const models = screen.getByRole('heading', { name: 'Models' }).parentElement as HTMLElement
    expect(within(models).getByText('claude-sonnet-4-5')).toBeInTheDocument()
    expect(within(models).getByText('6,040 tok · $0.0110')).toBeInTheDocument()
    expect(within(models).getByText('gpt-5.1')).toBeInTheDocument()
    expect(within(models).getByText('165 tok')).toBeInTheDocument()
  })

  it('shows a no-model message and source fallback', () => {
    renderWithProviders(
      <SessionTotalsRail session={sessionWith({ models: [], fileName: undefined, fileSize: undefined })} />,
    )
    expect(screen.getByText('No model recorded.')).toBeInTheDocument()
    expect(screen.getByText('Size unknown · 5 entries')).toBeInTheDocument()
  })

  it('renders sub-agent sessions collapsed with links to the child route', async () => {
    const { user } = renderWithProviders(
      <SessionTotalsRail session={session} relatedSessions={detail.relatedSessions} />,
    )

    const summary = screen.getByText('Sub-agent sessions').closest('summary') as HTMLElement
    const details = summary.closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)

    const link = screen.getByRole('link', { name: 'Mapped child 1' })
    expect(link).toHaveAttribute('href', `/sessions/${encodeURIComponent(SESSION_IDS.child)}`)

    await user.click(summary)
    expect(details.open).toBe(true)
    // Accessible disclosure: the summary is focusable via its summary role.
    expect(screen.getByText('Sub-agent sessions').closest('details')).toBe(details)
  })

  it('falls back to the session id for an unnamed child', () => {
    renderWithProviders(
      <SessionTotalsRail
        session={session}
        relatedSessions={[{ sessionId: SESSION_IDS.child, costTotal: 0.02, totalTokens: 150 }]}
      />,
    )
    expect(screen.getByRole('link', { name: SESSION_IDS.child })).toHaveAttribute(
      'href',
      `/sessions/${SESSION_IDS.child}`,
    )
  })

  it('renders an inline variant with the same accessible label', () => {
    renderWithProviders(<SessionTotalsRail session={session} variant="inline" />)
    expect(screen.getByRole('complementary', { name: 'Session totals' })).toHaveClass(
      'pm-totals-inline',
    )
  })
})

describe('SessionCostPanel', () => {
  it('shows total cost, token volume and per-category shares', () => {
    renderWithProviders(<SessionCostPanel session={session} />)
    expect(
      screen.getByRole('region', { name: 'Session cost and token summary' }),
    ).toBeInTheDocument()
    // Desktop total plus mobile tile.
    expect(screen.getAllByText('$0.0194').length).toBe(2)
    // 4,210 / 10,725 = 39.3%
    expect(screen.getByText(/39\.3%/)).toBeInTheDocument()
    // Reasoning shows a token count, never a fake reasoning cost.
    const reasoning = screen.getByText('Reasoning').parentElement as HTMLElement
    expect(within(reasoning).getByText('260')).toBeInTheDocument()
  })

  it('summarises turns and tool calls in the mobile tile', () => {
    renderWithProviders(
      <SessionCostPanel session={sessionWith({ counts: { ...session.counts, errors: 2 } })} />,
    )
    expect(screen.getByText(/1 turns · 1 tools \(2 err\)/)).toBeInTheDocument()
  })
})

describe('SessionHeader', () => {
  it('renders the title, metadata, model chips and status', () => {
    renderWithProviders(<SessionHeader session={session} isFetching={false} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Refactor parser pipeline' })).toBeInTheDocument()
    expect(screen.getAllByText('/work/alpha').length).toBeGreaterThan(0)
    expect(screen.getByText('Duration 2m 40s')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-4-5 · anthropic')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Sessions' })).toHaveAttribute('href', '/sessions')
    expect(screen.getByRole('button', { name: 'Copy session ID' })).toBeInTheDocument()
  })

  it('labels parse status and a refreshing fetch', () => {
    const { unmount } = renderWithProviders(
      <SessionHeader session={sessionWith({ parseStatus: 'warning' })} isFetching />,
    )
    expect(screen.getByText('Parse warning')).toBeInTheDocument()
    expect(screen.getByText('Refreshing…')).toBeInTheDocument()
    unmount()

    renderWithProviders(
      <SessionHeader session={sessionWith({ parseStatus: 'error' })} isFetching={false} />,
    )
    expect(screen.getByText('Parse error')).toBeInTheDocument()
  })

  it('shows a fallback when no model is recorded', () => {
    renderWithProviders(
      <SessionHeader session={sessionWith({ models: [], primaryModel: undefined })} isFetching={false} />,
    )
    expect(screen.getByText('No model recorded')).toBeInTheDocument()
  })

  it('exposes session details including id, path and entry count', () => {
    renderWithProviders(
      <SessionHeader
        session={sessionWith({ filePath: '/tmp/sessions/main.jsonl', fileName: 'main.jsonl', fileSize: 12_345 })}
        isFetching={false}
      />,
    )
    expect(screen.getByText('main.jsonl · 12.1 KB')).toBeInTheDocument()
    expect(screen.getByText('/tmp/sessions/main.jsonl')).toBeInTheDocument()
    expect(screen.getAllByText(SESSION_IDS.main).length).toBeGreaterThan(0)
    expect(screen.getByText('Session details')).toBeInTheDocument()
  })

  it('copies the session id through the clipboard', async () => {
    // `lib/clipboard.ts` only uses the async clipboard API in a secure context.
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined as unknown as void)

    const { user } = renderWithProviders(<SessionHeader session={session} isFetching={false} />)
    await user.click(screen.getByRole('button', { name: 'Copy session ID' }))
    expect(writeText).toHaveBeenCalledWith(SESSION_IDS.main)
    expect(
      await screen.findByRole('button', { name: 'Copy session ID: copied' }),
    ).toBeInTheDocument()
  })
})

describe('ParseWarningsBanner', () => {
  it('renders nothing without warnings', () => {
    const { container } = renderWithProviders(<ParseWarningsBanner warnings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each unparseable line with its message and snippet', async () => {
    const { user } = renderWithProviders(
      <ParseWarningsBanner
        warnings={[
          { line: 3, message: 'Unexpected token', rawSnippet: '{"broken":' },
          { line: 9, message: 'Truncated record', rawSnippet: '{"a":1' },
        ]}
      />,
    )

    expect(screen.getByText('PARSE WARNINGS')).toBeInTheDocument()
    expect(screen.getByText(/2 lines could not be parsed/)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Parse warning at line 3' })).toHaveTextContent(
      'Unexpected token',
    )
    expect(screen.getByRole('group', { name: 'Parse warning at line 9' })).toHaveTextContent(
      'Truncated record',
    )
    // Snippets are hidden behind a disclosure but always copyable.
    expect(screen.getAllByRole('button', { name: 'Copy snippet' })).toHaveLength(2)
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined as unknown as void)
    await user.click(screen.getAllByRole('button', { name: 'Copy snippet' })[0])
    expect(writeText).toHaveBeenCalledWith('{"broken":')
  })
})

describe('SessionDetailSkeleton', () => {
  it('is announced as a busy loading region', () => {
    renderWithProviders(<SessionDetailSkeleton />)
    expect(screen.getByLabelText('Loading session')).toHaveAttribute('aria-busy', 'true')
  })
})

describe('rail arithmetic sanity', () => {
  it('matches independently computed fixture totals', () => {
    expect(SUMMARY_TOKENS.input + SUMMARY_TOKENS.output + SUMMARY_TOKENS.cacheRead + SUMMARY_TOKENS.cacheWrite).toBe(
      SUMMARY_TOTAL_TOKENS,
    )
    expect(detail.combinedCostTotal).toBeCloseTo(SUMMARY_COST_TOTAL + detail.relatedCostTotal, 10)
  })
})
