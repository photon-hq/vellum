import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DiskCache, emptyDocComment } from '../src'
import type { CacheEntry, Symbol } from '../src'

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

describe('DiskCache — invalidation and edge cases', () => {
  let tempRoot: string
  let cacheDir: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'vellum-disk-test-'))
    cacheDir = join(tempRoot, 'node_modules', '.cache', 'vellum')
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('invalidates matching entries on disk', async () => {
    const cache = new DiskCache(tempRoot)
    await cache.set(makeEntry('a.ts', 'h1', [makeSym('A')]))
    await cache.set(makeEntry('b.ts', 'h2', [makeSym('B')]))

    // Verify both exist
    expect(await cache.get({ language: 'ts', file: 'a.ts', hash: 'h1' })).not.toBeNull()
    expect(await cache.get({ language: 'ts', file: 'b.ts', hash: 'h2' })).not.toBeNull()

    // Invalidate a.ts
    await cache.invalidate(k => k.file === 'a.ts')

    // a.ts should be gone from both hot layer and disk
    const freshCache = new DiskCache(tempRoot)
    expect(await freshCache.get({ language: 'ts', file: 'a.ts', hash: 'h1' })).toBeNull()
    // b.ts should still be there
    expect(await freshCache.get({ language: 'ts', file: 'b.ts', hash: 'h2' })).not.toBeNull()
  })

  it('handles corrupted cache files gracefully', async () => {
    const cache = new DiskCache(tempRoot)
    await cache.set(makeEntry('a.ts', 'h1', [makeSym('A')]))

    // Corrupt the file
    const files = readdirSync(cacheDir).filter(f => f.endsWith('.json'))
    expect(files.length).toBe(1)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(cacheDir, files[0]!), 'not json{{{')

    // New instance should handle the corruption
    const freshCache = new DiskCache(tempRoot)
    const result = await freshCache.get({ language: 'ts', file: 'a.ts', hash: 'h1' })
    expect(result).toBeNull()
  })

  it('handles hash collision guard (key mismatch)', async () => {
    const cache = new DiskCache(tempRoot)
    const entry = makeEntry('a.ts', 'h1', [makeSym('A')])
    await cache.set(entry)

    // Try to get with same file but different hash — different stable key, so miss
    const result = await cache.get({ language: 'ts', file: 'a.ts', hash: 'different' })
    expect(result).toBeNull()
  })

  it('writes multiple entries and reads them all back', async () => {
    const cache = new DiskCache(tempRoot)
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry(`file${i}.ts`, `hash${i}`, [makeSym(`Sym${i}`)]),
    )

    for (const entry of entries)
      await cache.set(entry)

    // Verify with fresh instance
    const freshCache = new DiskCache(tempRoot)
    for (const entry of entries) {
      const result = await freshCache.get(entry.key)
      expect(result).not.toBeNull()
      expect(result!.symbols[0]!.name).toBe(entry.symbols[0]!.name)
    }
  })

  it('clear removes files but recreates directory', async () => {
    const cache = new DiskCache(tempRoot)
    await cache.set(makeEntry('a.ts', 'h1', [makeSym('A')]))
    await cache.clear()

    expect(existsSync(cacheDir)).toBe(true)
    const files = readdirSync(cacheDir)
    expect(files).toHaveLength(0)
  })
})
