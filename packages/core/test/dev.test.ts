import type { Symbol } from '../src'
import { describe, expect, it } from 'vitest'
import {
  createTemplateReads,
  DependencyGraph,
  diffSymbols,
  emptyDocComment,
  InMemorySymbolIndex,
  matchesQuery,
  mergeDiffs,
} from '../src'

function makeSym(overrides: Partial<Symbol> & { id: string, name: string }): Symbol {
  return {
    kind: 'interface',
    language: 'ts',
    module: 'src/types.ts',
    source: { file: 'src/types.ts', line: 1, column: 1, endLine: 1, endColumn: 1 },
    visibility: 'public',
    exported: true,
    signature: '',
    typeRefs: [],
    doc: emptyDocComment(),
    tags: [],
    ...overrides,
  }
}

describe('matchesQuery', () => {
  it('parity with InMemorySymbolIndex.symbols() for module/kind/exported filters', () => {
    const syms = [
      makeSym({ id: 'ts:m#A', name: 'A', kind: 'const', module: 'm', exported: true }),
      makeSym({ id: 'ts:m#B', name: 'B', kind: 'function', module: 'm', exported: true }),
      makeSym({ id: 'ts:m#C', name: 'C', kind: 'const', module: 'm', exported: false }),
      makeSym({ id: 'ts:n#D', name: 'D', kind: 'const', module: 'n', exported: true }),
    ]
    const idx = new InMemorySymbolIndex()
    idx.add(syms)

    const cases = [
      { kind: 'const' as const },
      { module: 'm' },
      { module: 'n', exportedOnly: false },
      { prefix: 'A' },
    ]
    for (const q of cases) {
      const fromIndex = idx.symbols(q).map(s => s.id).sort()
      const fromPred = syms.filter(s => matchesQuery(s, q)).map(s => s.id).sort()
      expect(fromPred).toEqual(fromIndex)
    }
  })
})

describe('inMemorySymbolIndex.byFile', () => {
  it('symbolsByFile returns per-file symbols; removeByFile prunes', () => {
    const idx = new InMemorySymbolIndex()
    const a = makeSym({ id: 'ts:a.ts#A', name: 'A', module: 'a', source: { file: 'a.ts', line: 1, column: 1, endLine: 1, endColumn: 1 } })
    const b = makeSym({ id: 'ts:a.ts#B', name: 'B', module: 'a', source: { file: 'a.ts', line: 1, column: 1, endLine: 1, endColumn: 1 } })
    const c = makeSym({ id: 'ts:b.ts#C', name: 'C', module: 'b', source: { file: 'b.ts', line: 1, column: 1, endLine: 1, endColumn: 1 } })
    idx.add([a, b, c])

    expect(idx.symbolsByFile('a.ts').map(s => s.id).sort()).toEqual(['ts:a.ts#A', 'ts:a.ts#B'])
    expect(idx.symbolsByFile('b.ts').map(s => s.id)).toEqual(['ts:b.ts#C'])

    const removed = idx.removeByFile('a.ts')
    expect(removed.sort()).toEqual(['ts:a.ts#A', 'ts:a.ts#B'])
    expect(idx.symbol('ts:a.ts#A')).toBeNull()
    expect(idx.symbol('ts:b.ts#C')).not.toBeNull()
    expect(idx.module('a')).toBeNull()
  })
})

describe('diffSymbols', () => {
  it('detects added, removed, and changed ids', () => {
    const base = makeSym({ id: 'ts:m#A', name: 'A', module: 'm', signature: 'interface A {}' })
    const removed = makeSym({ id: 'ts:m#B', name: 'B', module: 'm' })
    const changed = makeSym({ id: 'ts:m#C', name: 'C', module: 'm', signature: 'interface C { x: string }' })
    const changedAfter = { ...changed, signature: 'interface C { x: number }' }
    const added = makeSym({ id: 'ts:n#D', name: 'D', module: 'n' })

    const prev = [base, removed, changed]
    const next = [base, changedAfter, added]
    const diff = diffSymbols(prev, next)
    expect([...diff.added]).toEqual(['ts:n#D'])
    expect([...diff.removed]).toEqual(['ts:m#B'])
    expect([...diff.changed]).toEqual(['ts:m#C'])
    expect([...diff.changedModules].sort()).toEqual(['m', 'n'])
  })

  it('ignores source-position-only changes', () => {
    const before = makeSym({ id: 'ts:m#A', name: 'A', source: { file: 'm.ts', line: 1, column: 1, endLine: 1, endColumn: 1 } })
    const after = { ...before, source: { file: 'm.ts', line: 42, column: 8, endLine: 50, endColumn: 2 } }
    const diff = diffSymbols([before], [after])
    expect(diff.added.size).toBe(0)
    expect(diff.removed.size).toBe(0)
    expect(diff.changed.size).toBe(0)
  })
})

describe('dependencyGraph.affectedTemplates', () => {
  function setup() {
    const idx = new InMemorySymbolIndex()
    const graph = new DependencyGraph()
    return { idx, graph }
  }

  it('fires when a directly-looked-up id is changed', () => {
    const { idx, graph } = setup()
    const sym = makeSym({ id: 'ts:m#A', name: 'A' })
    idx.add([sym])

    const reads = createTemplateReads()
    reads.ids.add('ts:m#A')
    graph.set('/tpl/a.vel', reads)

    const affected = graph.affectedTemplates(
      { added: new Set(), removed: new Set(), changed: new Set(['ts:m#A']), changedModules: new Set(['m']) },
      idx,
    )
    expect([...affected]).toEqual(['/tpl/a.vel'])
  })

  it('fires when a read module has members changed', () => {
    const { idx, graph } = setup()
    idx.add([makeSym({ id: 'ts:m#A', name: 'A', module: 'm' })])

    const reads = createTemplateReads()
    reads.modules.add('m')
    graph.set('/tpl/m.vel', reads)

    const affected = graph.affectedTemplates(
      { added: new Set(), removed: new Set(), changed: new Set(['ts:m#A']), changedModules: new Set(['m']) },
      idx,
    )
    expect([...affected]).toEqual(['/tpl/m.vel'])
  })

  it('fires when a prior query-result id is removed', () => {
    const { idx, graph } = setup()
    const reads = createTemplateReads()
    reads.queries.push({ module: 'm', kind: 'const' })
    reads.queryResultIds.add('ts:m#X')
    graph.set('/tpl/q.vel', reads)

    const affected = graph.affectedTemplates(
      { added: new Set(), removed: new Set(['ts:m#X']), changed: new Set(), changedModules: new Set(['m']) },
      idx,
    )
    expect([...affected]).toEqual(['/tpl/q.vel'])
  })

  it('fires when a newly-added symbol matches a recorded query', () => {
    const { idx, graph } = setup()
    const newSym = makeSym({ id: 'ts:m#New', name: 'New', module: 'm', kind: 'const' })
    idx.add([newSym])

    const reads = createTemplateReads()
    reads.queries.push({ module: 'm', kind: 'const' })
    graph.set('/tpl/q.vel', reads)

    const affected = graph.affectedTemplates(
      { added: new Set(['ts:m#New']), removed: new Set(), changed: new Set(), changedModules: new Set(['m']) },
      idx,
    )
    expect([...affected]).toEqual(['/tpl/q.vel'])
  })

  it('stays silent when reads do not intersect the diff', () => {
    const { idx, graph } = setup()
    const reads = createTemplateReads()
    reads.ids.add('ts:m#A')
    reads.modules.add('m')
    reads.queries.push({ module: 'm', kind: 'interface' })
    graph.set('/tpl/unrelated.vel', reads)

    const affected = graph.affectedTemplates(
      { added: new Set(['ts:other#X']), removed: new Set(), changed: new Set(), changedModules: new Set(['other']) },
      idx,
    )
    expect(affected.size).toBe(0)
  })
})

describe('mergeDiffs', () => {
  it('unions all four sets', () => {
    const a = { added: new Set(['1']), removed: new Set(['2']), changed: new Set(['3']), changedModules: new Set(['m1']) }
    const b = { added: new Set(['1', '4']), removed: new Set(['5']), changed: new Set(), changedModules: new Set(['m2']) }
    const m = mergeDiffs(a, b)
    expect([...m.added].sort()).toEqual(['1', '4'])
    expect([...m.removed].sort()).toEqual(['2', '5'])
    expect([...m.changed]).toEqual(['3'])
    expect([...m.changedModules].sort()).toEqual(['m1', 'm2'])
  })
})
