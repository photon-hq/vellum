import type { Symbol } from '../../core/src'
import { describe, expect, it } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { emptyDocComment, InMemorySymbolIndex } from '../../core/src'
import { computeDiagnostics } from '../src/features/diagnostics'

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

function makeDoc(content: string): TextDocument {
  return TextDocument.create('file:///test.vel', 'vel', 1, content)
}

function makeIndex(symbols: Symbol[]): InMemorySymbolIndex {
  const index = new InMemorySymbolIndex()
  index.add(symbols)
  return index
}

describe('diagnostics', () => {
  it('reports no diagnostics for valid symbol references', () => {
    const index = makeIndex([makeSym({ id: 'ts:src/types.ts#User', name: 'User' })])
    const doc = makeDoc('{% set t = symbol("ts:src/types.ts#User") %}')
    const diags = computeDiagnostics(doc, index)
    expect(diags).toHaveLength(0)
  })

  it('reports warning for unresolved symbol reference', () => {
    const index = makeIndex([])
    const doc = makeDoc('{% set t = symbol("ts:src/types.ts#Missing") %}')
    const diags = computeDiagnostics(doc, index)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.message).toContain('Missing')
    expect(diags[0]!.message).toContain('not found')
  })

  it('reports warning for unresolved module reference', () => {
    const index = makeIndex([])
    const doc = makeDoc('{% set m = module("src/nonexistent.ts") %}')
    const diags = computeDiagnostics(doc, index)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.message).toContain('src/nonexistent.ts')
  })

  it('reports no diagnostics for valid module references', () => {
    const index = makeIndex([
      makeSym({ id: 'ts:src/types.ts#User', name: 'User', module: 'src/types.ts' }),
    ])
    const doc = makeDoc('{% set m = module("src/types.ts") %}')
    const diags = computeDiagnostics(doc, index)
    expect(diags).toHaveLength(0)
  })

  it('reports warning for invalid kind in symbols() query', () => {
    const index = makeIndex([])
    const doc = makeDoc('{% for s in symbols({ kind: "badkind" }) %}{% endfor %}')
    const diags = computeDiagnostics(doc, index)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.message).toContain('badkind')
  })

  it('reports no diagnostics for valid kind values', () => {
    const index = makeIndex([])
    const doc = makeDoc('{% for s in symbols({ kind: "function" }) %}{% endfor %}')
    const diags = computeDiagnostics(doc, index)
    expect(diags).toHaveLength(0)
  })

  it('reports multiple diagnostics for multiple broken references', () => {
    const index = makeIndex([])
    const doc = makeDoc(`
{% set a = symbol("ts:m#A") %}
{% set b = symbol("ts:m#B") %}
{% set m = module("nonexistent") %}
`)
    const diags = computeDiagnostics(doc, index)
    expect(diags).toHaveLength(3)
  })
})
