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
    const { output: result } = await engine.render(
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
    const { output: result } = await engine.render(
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
    const { output: result } = await engine.render(
      '{% set t = symbol("ts:m#Bar") %}{{ t | link | safe }}',
      makeContext([sym]),
    )
    expect(result).toContain('`Bar`')
  })

  it('typeString renders type text', async () => {
    const sym = makeSym({ id: 'ts:m#X', name: 'X' })
    const { output: result } = await engine.render(
      '{{ { text: "string | null", refs: [] } | typeString | safe }}',
      makeContext([sym]),
    )
    expect(result).toContain('`string | null`')
  })

  it('example returns empty for out-of-range index', async () => {
    const sym = makeSym({ id: 'ts:m#X', name: 'X' })
    const { output: result } = await engine.render(
      '{% set t = symbol("ts:m#X") %}[{{ t | example(5) }}]',
      makeContext([sym]),
    )
    expect(result).toBe('[]')
  })

  it('summary works on plain objects', async () => {
    const { output: result } = await engine.render(
      '{{ { summary: "hello" } | summary }}',
      makeContext([]),
    )
    expect(result).toBe('hello')
  })

  it('summary returns empty for null', async () => {
    const { output: result } = await engine.render(
      '[{{ null | summary }}]',
      makeContext([]),
    )
    expect(result).toBe('[]')
  })

  it('cell: TypeString with oneline uses oneline', async () => {
    const { output: result } = await engine.render(
      '{{ { text: "A\\n  | B", oneline: "A | B", refs: [] } | cell | safe }}',
      makeContext([]),
    )
    expect(result).toBe('`A \\| B`')
  })

  it('cell: TypeString without oneline falls back to text (collapsed)', async () => {
    const { output: result } = await engine.render(
      '{{ { text: "A\\n  | B", refs: [] } | cell | safe }}',
      makeContext([]),
    )
    expect(result).toBe('`A \\| B`')
  })

  it('cell: plain string is escaped and wrapped', async () => {
    const { output: result } = await engine.render(
      '{{ "Array<string> | null" | cell | safe }}',
      makeContext([]),
    )
    expect(result).toBe('`Array<string> \\| null`')
  })

  it('cell: collapses multi-line input', async () => {
    const { output: result } = await engine.render(
      '{{ "line one\\n    line two\\n    line three" | cell | safe }}',
      makeContext([]),
    )
    expect(result).toBe('`line one line two line three`')
  })

  it('cell: null and undefined render as empty', async () => {
    const { output: nullRes } = await engine.render('[{{ null | cell | safe }}]', makeContext([]))
    expect(nullRes).toBe('[]')
    const { output: undefRes } = await engine.render('[{{ nope | cell | safe }}]', makeContext([]))
    expect(undefRes).toBe('[]')
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
    const { output: result } = await engine.render(
      '{% set t = symbol("ts:m#SendReceipt") %}{{ t | declaration }}',
      makeContext([sym]),
    )
    expect(result).toBe(canonical)
  })
})
