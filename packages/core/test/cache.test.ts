import type { CacheEntry, Symbol } from '../src'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DiskCache, emptyDocComment, InMemoryCache } from '../src'

function makeSym(name: string): Symbol {
  return {
    id: `ts:m#${name}`,
    name,
    kind: 'interface',
    language: 'ts',
    module: 'm',
    source: { file: 'm.ts', line: 1, column: 1, endLine: 1, endColumn: 1 },
    visibility: 'public',
    exported: true,
    signature: `interface ${name} {}`,
    typeRefs: [],
    doc: emptyDocComment(),
    tags: [],
  }
}

function makeEntry(file: string, hash: string, symbols: Symbol[]): CacheEntry {
  return { key: { language: 'ts', file, hash }, symbols }
}

describe('inMemoryCache', () => {
  it('stores and retrieves entries', async () => {
    const cache = new InMemoryCache()
    const entry = makeEntry('a.ts', 'abc123', [makeSym('A')])

    await cache.set(entry)
    const result = await cache.get(entry.key)
    expect(result).toBe(entry)
  })

  it('returns null on cache miss', async () => {
    const cache = new InMemoryCache()
    const result = await cache.get({ language: 'ts', file: 'x.ts', hash: 'nope' })
    expect(result).toBeNull()
  })

  it('misses when hash changes', async () => {
    const cache = new InMemoryCache()
    const entry = makeEntry('a.ts', 'hash1', [makeSym('A')])
    await cache.set(entry)

    const result = await cache.get({ language: 'ts', file: 'a.ts', hash: 'hash2' })
    expect(result).toBeNull()
  })

  it('invalidates by predicate', async () => {
    const cache = new InMemoryCache()
    await cache.set(makeEntry('a.ts', 'h1', [makeSym('A')]))
    await cache.set(makeEntry('b.ts', 'h2', [makeSym('B')]))

    await cache.invalidate(k => k.file === 'a.ts')

    expect(await cache.get({ language: 'ts', file: 'a.ts', hash: 'h1' })).toBeNull()
    expect(await cache.get({ language: 'ts', file: 'b.ts', hash: 'h2' })).not.toBeNull()
  })

  it('clears all entries', async () => {
    const cache = new InMemoryCache()
    await cache.set(makeEntry('a.ts', 'h1', [makeSym('A')]))
    await cache.clear()
    expect(await cache.get({ language: 'ts', file: 'a.ts', hash: 'h1' })).toBeNull()
  })
})

describe('diskCache', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'vellum-cache-test-'))
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('creates cache directory on construction', () => {
    const _cache = new DiskCache(tempRoot)
    expect(existsSync(join(tempRoot, 'node_modules', '.cache', 'vellum'))).toBe(true)
  })

  it('stores and retrieves entries across instances', async () => {
    const cache1 = new DiskCache(tempRoot)
    const entry = makeEntry('a.ts', 'abc123', [makeSym('A')])
    await cache1.set(entry)

    // New instance — reads from disk, not hot layer
    const cache2 = new DiskCache(tempRoot)
    const result = await cache2.get(entry.key)
    expect(result).not.toBeNull()
    expect(result!.key).toEqual(entry.key)
    expect(result!.symbols).toHaveLength(1)
    expect(result!.symbols[0]!.name).toBe('A')
  })

  it('returns null on cache miss', async () => {
    const cache = new DiskCache(tempRoot)
    const result = await cache.get({ language: 'ts', file: 'x.ts', hash: 'nope' })
    expect(result).toBeNull()
  })

  it('misses when hash changes', async () => {
    const cache = new DiskCache(tempRoot)
    await cache.set(makeEntry('a.ts', 'hash1', [makeSym('A')]))

    const result = await cache.get({ language: 'ts', file: 'a.ts', hash: 'hash2' })
    expect(result).toBeNull()
  })

  it('uses hot layer for repeated reads', async () => {
    const cache = new DiskCache(tempRoot)
    const entry = makeEntry('a.ts', 'abc', [makeSym('A')])
    await cache.set(entry)

    // First read populates hot layer, second read hits it
    const r1 = await cache.get(entry.key)
    const r2 = await cache.get(entry.key)
    expect(r1).toBe(r2) // same object reference = hot layer hit
  })

  it('clear() removes all files and hot entries', async () => {
    const cache = new DiskCache(tempRoot)
    await cache.set(makeEntry('a.ts', 'h1', [makeSym('A')]))
    await cache.clear()

    expect(await cache.get({ language: 'ts', file: 'a.ts', hash: 'h1' })).toBeNull()
    // Directory is recreated but empty
    expect(existsSync(join(tempRoot, 'node_modules', '.cache', 'vellum'))).toBe(true)
  })
})
