import type { Symbol } from '../../core/src'
import { describe, expect, it } from 'vitest'
import { emptyDocComment, InMemorySymbolIndex } from '../../core/src'
import { MarkdownProfile } from '../../profile-markdown/src'
import { NunjucksEngine } from '../src'

function makeSym(overrides: Partial<Symbol> & { id: string, name: string }): Symbol {
  return {
    kind: 'interface',
    language: 'ts',
    module: 'src/types.ts',
    source: { file: 'src/types.ts', line: 1, column: 1, endLine: 1, endColumn: 1 },
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
  return {
    index,
    profile: new MarkdownProfile(),
    sourceFile: 'test.mdx.vel',
  }
}

describe('nunjucksEngine', () => {
  const engine = new NunjucksEngine()

  it('renders plain text without directives', async () => {
    const result = await engine.render('Hello world', makeContext([]))
    expect(result).toBe('Hello world')
  })

  it('provides symbol() global', async () => {
    const sym = makeSym({
      id: 'ts:src/types.ts#User',
      name: 'User',
      doc: { ...emptyDocComment(), summary: 'A user.' },
    })
    const result = await engine.render(
      '{% set t = symbol("ts:src/types.ts#User") %}{{ t.name }}: {{ t.doc.summary }}',
      makeContext([sym]),
    )
    expect(result).toBe('User: A user.')
  })

  it('provides symbols() global with query', async () => {
    const syms = [
      makeSym({ id: 'ts:m#A', name: 'A', kind: 'const', module: 'm' }),
      makeSym({ id: 'ts:m#B', name: 'B', kind: 'const', module: 'm' }),
      makeSym({ id: 'ts:m#C', name: 'C', kind: 'function', module: 'm' }),
    ]
    const result = await engine.render(
      '{% for s in symbols({ module: "m", kind: "const" }) %}{{ s.name }},{% endfor %}',
      makeContext(syms),
    )
    expect(result).toBe('A,B,')
  })

  it('provides module() global', async () => {
    const syms = [
      makeSym({ id: 'ts:m#A', name: 'A', module: 'm', exported: true }),
      makeSym({ id: 'ts:m#B', name: 'B', module: 'm', exported: false }),
    ]
    const result = await engine.render(
      '{% set mod = module("m") %}{{ mod.exports | length }}',
      makeContext(syms),
    )
    expect(result).toBe('1')
  })

  it('provides signature filter', async () => {
    const sym = makeSym({
      id: 'ts:m#User',
      name: 'User',
      signature: 'interface User { id: string }',
    })
    const result = await engine.render(
      '{% set t = symbol("ts:m#User") %}{{ t | signature | safe }}',
      makeContext([sym]),
    )
    expect(result).toContain('```ts')
    expect(result).toContain('interface User { id: string }')
  })

  it('provides summary filter', async () => {
    const sym = makeSym({
      id: 'ts:m#User',
      name: 'User',
      doc: { ...emptyDocComment(), summary: 'A user record.' },
    })
    const result = await engine.render(
      '{% set t = symbol("ts:m#User") %}{{ t | summary }}',
      makeContext([sym]),
    )
    expect(result).toBe('A user record.')
  })

  it('provides example filter', async () => {
    const sym = makeSym({
      id: 'ts:m#User',
      name: 'User',
      doc: {
        ...emptyDocComment(),
        examples: [{ title: null, lang: 'ts', code: 'const u = new User()', description: null }],
      },
    })
    const result = await engine.render(
      '{% set t = symbol("ts:m#User") %}{{ t | example(0) }}',
      makeContext([sym]),
    )
    expect(result).toBe('const u = new User()')
  })

  it('strict mode (default) fails on missing symbols - no silent empty output', async () => {
    await expect(
      engine.render(
        '{% set t = symbol("ts:m#Missing") %}{{ t }}',
        makeContext([]),
      ),
    ).rejects.toThrow()
  })

  it('lenient mode renders missing symbols as empty', async () => {
    const lenient = new NunjucksEngine({ strict: false })
    const result = await lenient.render(
      '{% set t = symbol("ts:m#Missing") %}{{ t }}',
      makeContext([]),
    )
    expect(result.trim()).toBe('')
  })

  it('supports iteration with for loops', async () => {
    const syms = [
      makeSym({ id: 'ts:m#A', name: 'Alpha', module: 'm', kind: 'const', value: { kind: 'number', text: '1' } }),
      makeSym({ id: 'ts:m#B', name: 'Beta', module: 'm', kind: 'const', value: { kind: 'number', text: '2' } }),
    ]
    const template = `{% for c in symbols({ module: "m", kind: "const" }) %}| {{ c.name }} | {{ c.value.text }} |
{% endfor %}`
    const result = await engine.render(template, makeContext(syms))
    expect(result).toContain('| Alpha | 1 |')
    expect(result).toContain('| Beta | 2 |')
  })

  it('supports conditional rendering', async () => {
    const sym = makeSym({
      id: 'ts:m#User',
      name: 'User',
      members: [
        {
          name: 'id',
          kind: 'property',
          signature: 'id: string',
          type: { text: 'string', refs: [] },
          optional: false,
          readonly: false,
          visibility: 'public',
          static: false,
          doc: emptyDocComment(),
        },
      ],
    })
    const template = `{% set t = symbol("ts:m#User") %}{% if t.members %}has {{ t.members | length }} members{% endif %}`
    const result = await engine.render(template, makeContext([sym]))
    expect(result).toBe('has 1 members')
  })
})
