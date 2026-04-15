import type { Symbol } from '../src'
import { describe, expect, it } from 'vitest'
import { emptyDocComment, InMemorySymbolIndex } from '../src'

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

describe('inMemorySymbolIndex', () => {
  it('adds and retrieves symbols by id', () => {
    const index = new InMemorySymbolIndex()
    const sym = makeSym({ id: 'ts:src/types.ts#User', name: 'User' })
    index.add([sym])

    expect(index.symbol('ts:src/types.ts#User')).toBe(sym)
    expect(index.symbol('ts:src/types.ts#Missing')).toBeNull()
  })

  it('queries by module', () => {
    const index = new InMemorySymbolIndex()
    index.add([
      makeSym({ id: 'ts:src/types.ts#User', name: 'User', module: 'src/types.ts' }),
      makeSym({ id: 'ts:src/api.ts#getUser', name: 'getUser', module: 'src/api.ts', kind: 'function' }),
    ])

    const results = index.symbols({ module: 'src/types.ts' })
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('User')
  })

  it('queries by kind', () => {
    const index = new InMemorySymbolIndex()
    index.add([
      makeSym({ id: 'ts:m#A', name: 'A', kind: 'interface' }),
      makeSym({ id: 'ts:m#B', name: 'B', kind: 'function' }),
      makeSym({ id: 'ts:m#C', name: 'C', kind: 'const' }),
    ])

    expect(index.symbols({ kind: 'function' })).toHaveLength(1)
    expect(index.symbols({ kind: ['interface', 'const'] })).toHaveLength(2)
  })

  it('queries by language', () => {
    const index = new InMemorySymbolIndex()
    index.add([
      makeSym({ id: 'ts:m#A', name: 'A', language: 'ts' }),
      makeSym({ id: 'py:m#B', name: 'B', language: 'py' }),
    ])

    expect(index.symbols({ language: 'ts' })).toHaveLength(1)
    expect(index.symbols({ language: 'py' })).toHaveLength(1)
    expect(index.symbols({ language: 'rust' })).toHaveLength(0)
  })

  it('queries by prefix', () => {
    const index = new InMemorySymbolIndex()
    index.add([
      makeSym({ id: 'ts:m#MAX_A', name: 'MAX_A', kind: 'const' }),
      makeSym({ id: 'ts:m#MAX_B', name: 'MAX_B', kind: 'const' }),
      makeSym({ id: 'ts:m#MIN_C', name: 'MIN_C', kind: 'const' }),
    ])

    expect(index.symbols({ prefix: 'MAX_' })).toHaveLength(2)
  })

  it('filters exported only by default', () => {
    const index = new InMemorySymbolIndex()
    index.add([
      makeSym({ id: 'ts:m#Pub', name: 'Pub', exported: true }),
      makeSym({ id: 'ts:m#Priv', name: 'Priv', exported: false }),
    ])

    expect(index.symbols()).toHaveLength(1)
    expect(index.symbols({ exportedOnly: false })).toHaveLength(2)
  })

  it('supports module glob patterns', () => {
    const index = new InMemorySymbolIndex()
    index.add([
      makeSym({ id: 'ts:src/api/users.ts#A', name: 'A', module: 'src/api/users.ts' }),
      makeSym({ id: 'ts:src/api/posts.ts#B', name: 'B', module: 'src/api/posts.ts' }),
      makeSym({ id: 'ts:src/types.ts#C', name: 'C', module: 'src/types.ts' }),
    ])

    expect(index.symbols({ module: 'src/api/**' })).toHaveLength(2)
    expect(index.symbols({ module: 'src/*.ts' })).toHaveLength(1)
  })

  it('returns sorted results', () => {
    const index = new InMemorySymbolIndex()
    index.add([
      makeSym({ id: 'ts:m#Zebra', name: 'Zebra' }),
      makeSym({ id: 'ts:m#Alpha', name: 'Alpha' }),
      makeSym({ id: 'ts:m#Middle', name: 'Middle' }),
    ])

    const names = index.symbols().map(s => s.name)
    expect(names).toEqual(['Alpha', 'Middle', 'Zebra'])
  })

  it('module() returns only exported symbols', () => {
    const index = new InMemorySymbolIndex()
    index.add([
      makeSym({ id: 'ts:m#A', name: 'A', module: 'm', exported: true }),
      makeSym({ id: 'ts:m#B', name: 'B', module: 'm', exported: false }),
    ])

    const mod = index.module('m')
    expect(mod).not.toBeNull()
    expect(mod!.exports).toHaveLength(1)
    expect(mod!.exports[0]!.name).toBe('A')
  })

  it('deduplicates symbols across repeated add() calls', () => {
    const index = new InMemorySymbolIndex()
    const v1 = makeSym({ id: 'ts:m#A', name: 'A', module: 'm', signature: 'v1' })
    const v2 = makeSym({ id: 'ts:m#A', name: 'A', module: 'm', signature: 'v2' })

    index.add([v1])
    index.add([v2])

    // byId should have the latest version
    expect(index.symbol('ts:m#A')!.signature).toBe('v2')

    // byModule should contain exactly one entry, not two
    const mod = index.module('m')
    expect(mod).not.toBeNull()
    const matching = mod!.exports.filter(s => s.id === 'ts:m#A')
    expect(matching).toHaveLength(1)
    expect(matching[0]!.signature).toBe('v2')
  })

  it('deduplicates when symbol moves between modules', () => {
    const index = new InMemorySymbolIndex()
    const v1 = makeSym({ id: 'ts:m#A', name: 'A', module: 'old-module' })
    const v2 = makeSym({ id: 'ts:m#A', name: 'A', module: 'new-module' })

    index.add([v1])
    index.add([v2])

    // Old module should not contain the symbol anymore
    const oldMod = index.module('old-module')
    expect(oldMod === null || oldMod.exports.length === 0).toBe(true)

    // New module should contain it
    const newMod = index.module('new-module')
    expect(newMod).not.toBeNull()
    expect(newMod!.exports).toHaveLength(1)
  })

  it('clear() removes all symbols', () => {
    const index = new InMemorySymbolIndex()
    index.add([makeSym({ id: 'ts:m#A', name: 'A' })])
    expect(index.all()).toHaveLength(1)

    index.clear()
    expect(index.all()).toHaveLength(0)
    expect(index.symbol('ts:m#A')).toBeNull()
  })
})
