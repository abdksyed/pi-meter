/** ANSI/control-character sanitization and preview truncation. */

import { describe, expect, it } from 'vitest'

import { buildPreview, lineCount, sanitizeText, stripAnsi, truncateHard } from './ansi'

describe('stripAnsi', () => {
  it('removes CSI colour sequences', () => {
    expect(stripAnsi('\u001B[31mred\u001B[0m text')).toBe('red text')
  })

  it('removes OSC sequences terminated by BEL or ST', () => {
    expect(stripAnsi('\u001B]0;title\u0007body')).toBe('body')
    expect(stripAnsi('\u001B]8;;https://example.com\u001B\\link\u001B]8;;\u001B\\')).toBe('link')
  })

  it('removes other escape sequences', () => {
    expect(stripAnsi('a\u001B@b')).toBe('ab')
  })
})

describe('sanitizeText', () => {
  it('normalizes CRLF and CR to LF', () => {
    expect(sanitizeText('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('replaces control characters with the replacement character', () => {
    // NUL, BEL and DEL are all replaced one-for-one.
    expect(sanitizeText('a\u0000b\u0007c\u007F')).toBe('a\uFFFDb\uFFFDc\uFFFD')
  })

  it('keeps tabs, newlines and ANSI-stripped printable text', () => {
    expect(sanitizeText('\u001B[32mok\u001B[0m\n\tindented')).toBe('ok\n\tindented')
  })

  it('does not reinterpret markup: the text stays inert', () => {
    const payload = '<script>alert(1)</script>'
    expect(sanitizeText(payload)).toBe(payload)
  })
})

describe('lineCount', () => {
  it('counts lines for empty and multi-line text', () => {
    expect(lineCount('')).toBe(0)
    expect(lineCount('one')).toBe(1)
    expect(lineCount('one\ntwo\nthree')).toBe(3)
  })
})

describe('buildPreview', () => {
  it('returns the full text when it fits', () => {
    expect(buildPreview('a\nb', 10, 100)).toEqual({
      text: 'a\nb',
      lines: 2,
      truncated: false,
      shownLines: 2,
    })
  })

  it('truncates by line count', () => {
    const preview = buildPreview('a\nb\nc\nd', 2, 100)
    expect(preview.text).toBe('a\nb')
    expect(preview.truncated).toBe(true)
    expect(preview.lines).toBe(4)
    expect(preview.shownLines).toBe(2)
  })

  it('truncates by character count', () => {
    const preview = buildPreview('x'.repeat(50), 10, 10)
    expect(preview.text).toBe('x'.repeat(10))
    expect(preview.truncated).toBe(true)
    expect(preview.shownLines).toBe(1)
  })
})

describe('truncateHard', () => {
  it('truncates only past the limit', () => {
    expect(truncateHard('abc', 5)).toEqual({ text: 'abc', truncated: false })
    expect(truncateHard('abcdef', 3)).toEqual({ text: 'abc', truncated: true })
  })
})
