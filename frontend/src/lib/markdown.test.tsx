/**
 * Markdown renderer: block structure, highlight integration and the safety
 * boundary (no raw HTML execution, no javascript:/data: links).
 */

import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { Markdown } from './markdown'
import { renderWithProviders } from '../test/helpers'

function renderMarkdown(text: string, query?: string) {
  return renderWithProviders(<Markdown text={text} query={query} />)
}

describe('Markdown blocks', () => {
  it('renders paragraphs and inline emphasis/code', () => {
    const { container } = renderMarkdown('plain **bold** and *italic* with `code`')
    expect(container.querySelectorAll('p.pm-md__paragraph')).toHaveLength(1)
    expect(screen.getByText('bold').closest('strong')).not.toBeNull()
    expect(screen.getByText('italic').closest('em')).not.toBeNull()
    expect(screen.getByText('code').tagName).toBe('CODE')
  })

  it('demotes headings so page hierarchy stays intact', () => {
    const { container } = renderMarkdown('# One\n\n### Three')
    expect(container.querySelector('h1')).toBeNull()
    expect(container.querySelector('h3')).not.toBeNull()
    expect(container.querySelector('h5')).not.toBeNull()
  })

  it('renders fences, lists, quotes, rules and tables', () => {
    const { container } = renderMarkdown(
      [
        '```python',
        'print(1)',
        '```',
        '',
        '- one',
        '- two',
        '',
        '> quoted',
        '',
        '---',
        '',
        '| a | b |',
        '| --- | --- |',
        '| 1 | 2 |',
      ].join('\n'),
    )
    expect(container.querySelector('.pm-code-frame')).not.toBeNull()
    expect(container.querySelectorAll('.pm-md__list li')).toHaveLength(2)
    expect(container.querySelector('blockquote')?.textContent).toBe('quoted')
    expect(container.querySelector('hr')).not.toBeNull()
    expect(container.querySelectorAll('th')).toHaveLength(2)
    expect(container.querySelectorAll('tbody td')).toHaveLength(2)
  })

  it('shows an inert placeholder for images', () => {
    const { container } = renderMarkdown('![diagram](https://example.com/x.png)')
    expect(container.querySelector('.pm-md__image-placeholder')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('Markdown safety', () => {
  it('does not create elements from embedded HTML or script tags', () => {
    const { container } = renderMarkdown('<script>window.__pwned = true</script>\n\n<img src=x onerror="alert(1)">')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
    expect(container.textContent).toContain('<script>')
  })

  it('keeps http(s) and mailto links safe', () => {
    const { container } = renderMarkdown('[docs](https://example.com/a) and [mail](mailto:a@b.test)')
    const links = [...container.querySelectorAll('a')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/a',
      'mailto:a@b.test',
    ])
    for (const link of links) {
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
      expect(link.getAttribute('target')).toBe('_blank')
    }
  })

  it('refuses executable link schemes', () => {
    const { container } = renderMarkdown(
      '[x](javascript:alert(1)) [y](data:text/html;base64,PHNjcmlwdD4=) [z](file:///etc/passwd)',
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('x')
  })

  it('falls back to a plain <pre> for oversized payloads', () => {
    const huge = 'a'.repeat(100_001)
    const { container } = renderMarkdown(huge)
    const pre = container.querySelector('pre.pm-md--plain')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toHaveLength(100_001)
    // No block parsing happens for the oversized fallback.
    expect(container.querySelector('p')).toBeNull()
  })

  it('strips ANSI escapes inside fenced code but not in prose (current behaviour)', () => {
    const fenced = renderMarkdown('```\n\u001B[31mcolored\u001B[0m\n```')
    expect(fenced.container.querySelector('.pm-code')?.textContent).toContain('colored')
    expect(fenced.container.textContent).not.toContain('\u001B')

    // Prose output is inserted as React text nodes (inert), so ESC bytes are
    // displayed rather than executed. Displayed mojibake is a known cosmetic
    // gap; it must never produce markup or executable behaviour.
    const prose = renderMarkdown('\u001B[31mcolored\u001B[0m text')
    expect(prose.container.textContent).toContain('colored')
    expect(prose.container.querySelector('script')).toBeNull()
    expect(prose.container.children[0]?.children[0]?.tagName).toBe('P')
  })
})

describe('Markdown search highlighting', () => {
  it('marks query hits and escapes nothing else', () => {
    const { container } = renderMarkdown('the parser needs a parser', 'parser')
    const marks = [...container.querySelectorAll('mark')]
    expect(marks).toHaveLength(2)
    expect(marks.every((mark) => mark.textContent === 'parser')).toBe(true)
  })
})
