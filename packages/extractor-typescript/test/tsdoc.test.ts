import { describe, expect, it } from 'vitest'
import { parseTSDoc } from '../src/tsdoc'

describe('parseTSDoc', () => {
  it('returns empty doc for empty string', () => {
    const doc = parseTSDoc('')
    expect(doc.summary).toBe('')
    expect(doc.raw).toBe('')
  })

  it('returns empty doc for whitespace-only', () => {
    const doc = parseTSDoc('   ')
    expect(doc.summary).toBe('')
  })

  it('parses summary from simple comment', () => {
    const doc = parseTSDoc('/** A simple summary. */')
    expect(doc.summary).toBe('A simple summary.')
  })

  it('parses multi-paragraph: summary + description', () => {
    const doc = parseTSDoc(`/**
 * First paragraph is the summary.
 *
 * Second paragraph becomes description.
 */`)
    expect(doc.summary).toBe('First paragraph is the summary.')
    expect(doc.description).toContain('Second paragraph becomes description.')
  })

  it('parses @remarks into description', () => {
    const doc = parseTSDoc(`/**
 * Summary here.
 *
 * @remarks
 * These are detailed remarks.
 */`)
    expect(doc.summary).toBe('Summary here.')
    expect(doc.description).toContain('These are detailed remarks.')
  })

  it('parses @param blocks', () => {
    const doc = parseTSDoc(`/**
 * Does something.
 *
 * @param id - The identifier.
 * @param name - The display name.
 */`)
    expect(doc.params.id).toBe('The identifier.')
    expect(doc.params.name).toBe('The display name.')
  })

  it('parses @returns block', () => {
    const doc = parseTSDoc(`/**
 * Gets a thing.
 *
 * @returns The thing or null.
 */`)
    expect(doc.returns).toBe('The thing or null.')
  })

  it('parses @deprecated block', () => {
    const doc = parseTSDoc(`/**
 * Old function.
 *
 * @deprecated Use newFunction instead.
 */`)
    expect(doc.deprecated).not.toBeNull()
    expect(doc.deprecated!.reason).toBe('Use newFunction instead.')
  })

  it('parses @see blocks', () => {
    const doc = parseTSDoc(`/**
 * A thing.
 *
 * @see https://example.com
 */`)
    expect(doc.see).toHaveLength(1)
    expect(doc.see[0]).toContain('https://example.com')
  })

  it('parses @example with fenced code block', () => {
    const doc = parseTSDoc(`/**
 * A thing.
 *
 * @example
 * \`\`\`ts
 * const x = doThing();
 * \`\`\`
 */`)
    expect(doc.examples).toHaveLength(1)
    expect(doc.examples[0]!.lang).toBe('ts')
    expect(doc.examples[0]!.code).toContain('const x = doThing()')
  })

  it('parses @example without fenced code (raw text fallback)', () => {
    const doc = parseTSDoc(`/**
 * A thing.
 *
 * @example
 * Just some text.
 */`)
    expect(doc.examples).toHaveLength(1)
    expect(doc.examples[0]!.code).toContain('Just some text.')
  })

  it('parses multiple @example blocks', () => {
    const doc = parseTSDoc(`/**
 * A thing.
 *
 * @example
 * \`\`\`ts
 * first();
 * \`\`\`
 *
 * @example
 * \`\`\`ts
 * second();
 * \`\`\`
 */`)
    expect(doc.examples).toHaveLength(2)
    expect(doc.examples[0]!.code).toContain('first()')
    expect(doc.examples[1]!.code).toContain('second()')
  })

  it('parses modifier tags (@beta, @internal)', () => {
    const doc = parseTSDoc(`/**
 * A beta thing.
 *
 * @beta
 */`)
    expect(doc.customTags).toHaveProperty('@beta')
  })

  it('parses custom block tags', () => {
    const doc = parseTSDoc(`/**
 * A thing.
 *
 * @category Utilities
 */`)
    expect(doc.customTags).toHaveProperty('@category')
  })

  it('parses {@link} inline tags', () => {
    const doc = parseTSDoc(`/**
 * Returns a {@link User} record.
 */`)
    expect(doc.summary).toContain('`User`')
  })

  it('parses {@link} with alt text', () => {
    const doc = parseTSDoc(`/**
 * Returns a {@link User | user object}.
 */`)
    expect(doc.summary).toContain('user object')
  })

  it('parses inline code spans', () => {
    const doc = parseTSDoc(`/**
 * Set the \`timeout\` value.
 */`)
    expect(doc.summary).toContain('`timeout`')
  })

  it('preserves raw comment', () => {
    const raw = '/** Hello world. */'
    const doc = parseTSDoc(raw)
    expect(doc.raw).toBe(raw)
  })
})
