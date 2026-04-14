import type { Symbol } from '../../core/src'
import { describe, expect, it } from 'vitest'
import { emptyDocComment, InMemorySymbolIndex } from '../../core/src'
import { MarkdownProfile } from '../../profile-markdown/src'
import { NunjucksEngine } from '../src'

function makeSym(overrides: Partial<Symbol> & { id: string, name: string }): Symbol {
  return {
    kind: 'interface',
    language: 'ts',
    module: 'm',
    source: { file: 'm.ts', line: 1, column: 1, endLine: 1, endColumn: 1 },
    visibility: 'public',
    exported: true,
    signature: `interface ${overrides.name} {}`,
    typeRefs: [],
    doc: emptyDocComment(),
    tags: [],
    ...overrides,
  }
}

function makeContext(symbols: Symbol[]) {
  const index = new InMemorySymbolIndex()
  index.add(symbols)
  return { index, profile: new MarkdownProfile(), sourceFile: 'test.vel' }
}

const engine = new NunjucksEngine()

describe('filters', () => {
  it('typeRef renders inline code', async () => {
    const sym = makeSym({ id: 'ts:m#Foo', name: 'Foo' })
    const result = await engine.render(
      '{% set t = symbol("ts:m#Foo") %}{{ t | typeRef | safe }}',
      makeContext([sym]),
    )
    expect(result).toContain('`Foo`')
  })

  it('typeCard renders full card', async () => {
    const sym = makeSym({
      id: 'ts:m#Foo',
      name: 'Foo',
      signature: 'interface Foo { x: number }',
      doc: {
        ...emptyDocComment(),
        summary: 'A foo.',
        examples: [{ title: null, lang: 'ts', code: 'new Foo()', description: null }],
      },
    })
    const result = await engine.render(
      '{% set t = symbol("ts:m#Foo") %}{{ t | typeCard | safe }}',
      makeContext([sym]),
    )
    expect(result).toContain('### Foo')
    expect(result).toContain('A foo.')
    expect(result).toContain('interface Foo { x: number }')
    expect(result).toContain('new Foo()')
  })

  it('link renders name as code', async () => {
    const sym = makeSym({ id: 'ts:m#Bar', name: 'Bar' })
    const result = await engine.render(
      '{% set t = symbol("ts:m#Bar") %}{{ t | link | safe }}',
      makeContext([sym]),
    )
    expect(result).toContain('`Bar`')
  })

  it('typeString renders type text', async () => {
    const sym = makeSym({ id: 'ts:m#X', name: 'X' })
    const result = await engine.render(
      '{{ { text: "string | null", refs: [] } | typeString | safe }}',
      makeContext([sym]),
    )
    expect(result).toContain('`string | null`')
  })

  it('example returns empty for out-of-range index', async () => {
    const sym = makeSym({ id: 'ts:m#X', name: 'X' })
    const result = await engine.render(
      '{% set t = symbol("ts:m#X") %}[{{ t | example(5) }}]',
      makeContext([sym]),
    )
    expect(result).toBe('[]')
  })

  it('summary works on plain objects', async () => {
    const result = await engine.render(
      '{{ { summary: "hello" } | summary }}',
      makeContext([]),
    )
    expect(result).toBe('hello')
  })

  it('summary returns empty for null', async () => {
    const result = await engine.render(
      '[{{ null | summary }}]',
      makeContext([]),
    )
    expect(result).toBe('[]')
  })

  it('declaration returns the canonical signature populated by the extractor', async () => {
    const canonical = `interface SendReceipt {
    readonly guid: MessageGuid;
    clientMessageId?: string;
}`
    const sym = makeSym({
      id: 'ts:m#SendReceipt',
      name: 'SendReceipt',
      signature: canonical,
    })
    const result = await engine.render(
      '{% set t = symbol("ts:m#SendReceipt") %}{{ t | declaration }}',
      makeContext([sym]),
    )
    expect(result).toBe(canonical)
  })
})
