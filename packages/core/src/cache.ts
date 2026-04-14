import type { Symbol } from './types'

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Bump when the Symbol shape changes in a way that invalidates cached entries.
 * Including this in the cache key means old entries are silently ignored after
 * an upgrade — no explicit migration needed.
 */
export const CACHE_SCHEMA_VERSION = 1

export interface CacheKey {
  language: string
  file: string
  hash: string
}

export interface CacheEntry {
  key: CacheKey
  symbols: Symbol[]
}

export interface Cache {
  get: (key: CacheKey) => Promise<CacheEntry | null>
  set: (entry: CacheEntry) => Promise<void>
  invalidate: (predicate: (key: CacheKey) => boolean) => Promise<void>
  clear: () => Promise<void>
}

export class InMemoryCache implements Cache {
  private store = new Map<string, CacheEntry>()

  private toKey(k: CacheKey): string {
    return `${CACHE_SCHEMA_VERSION}:${k.language}:${k.file}:${k.hash}`
  }

  async get(key: CacheKey): Promise<CacheEntry | null> {
    return this.store.get(this.toKey(key)) ?? null
  }

  async set(entry: CacheEntry): Promise<void> {
    this.store.set(this.toKey(entry.key), entry)
  }

  async invalidate(predicate: (key: CacheKey) => boolean): Promise<void> {
    for (const [k, entry] of this.store) {
      if (predicate(entry.key))
        this.store.delete(k)
    }
  }

  async clear(): Promise<void> {
    this.store.clear()
  }
}

/**
 * Disk-backed cache stored in `node_modules/.cache/vellum/`.
 *
 * Each cache entry is a JSON file keyed by a hash of (language, file, content-hash).
 * Cache hits avoid re-running the extractor for unchanged files across builds.
 */
export class DiskCache implements Cache {
  private readonly dir: string
  /** In-memory hot layer so repeated lookups within a single build are free. */
  private hot = new Map<string, CacheEntry>()

  constructor(root: string) {
    this.dir = join(root, 'node_modules', '.cache', 'vellum')
    mkdirSync(this.dir, { recursive: true })
  }

  private entryPath(stableKey: string): string {
    return join(this.dir, `${stableKey}.json`)
  }

  private stableKey(key: CacheKey): string {
    // Hash the composite key so filenames stay short and filesystem-safe.
    // CACHE_SCHEMA_VERSION ensures entries from older schema versions are ignored.
    return createHash('sha1')
      .update(`${CACHE_SCHEMA_VERSION}\0${key.language}\0${key.file}\0${key.hash}`)
      .digest('hex')
  }

  async get(key: CacheKey): Promise<CacheEntry | null> {
    const sk = this.stableKey(key)

    // Check hot layer first.
    const hotHit = this.hot.get(sk)
    if (hotHit)
      return hotHit

    // Check disk.
    const path = this.entryPath(sk)
    if (!existsSync(path))
      return null

    try {
      const raw = readFileSync(path, 'utf8')
      const entry: CacheEntry = JSON.parse(raw)
      // Validate that the stored key matches (guards against hash collisions).
      if (
        entry.key.language !== key.language
        || entry.key.file !== key.file
        || entry.key.hash !== key.hash
      ) {
        return null
      }
      this.hot.set(sk, entry)
      return entry
    }
    catch {
      // Corrupted cache file — ignore.
      return null
    }
  }

  async set(entry: CacheEntry): Promise<void> {
    const sk = this.stableKey(entry.key)
    this.hot.set(sk, entry)

    // Write to disk. Fire-and-forget style errors are swallowed — a failed
    // cache write just means the next build re-extracts.
    try {
      writeFileSync(this.entryPath(sk), JSON.stringify(entry))
    }
    catch {
      // Disk write failed — non-fatal.
    }
  }

  async invalidate(predicate: (key: CacheKey) => boolean): Promise<void> {
    // Invalidate hot layer.
    for (const [sk, entry] of this.hot) {
      if (predicate(entry.key))
        this.hot.delete(sk)
    }

    // Scan disk entries. This is expensive but invalidate() is rare
    // (typically only called by a future `vellum clean` or cache GC).
    try {
      const files = await readdir(this.dir)
      for (const file of files) {
        if (!file.endsWith('.json'))
          continue
        const path = join(this.dir, file)
        try {
          const raw = await readFile(path, 'utf8')
          const entry: CacheEntry = JSON.parse(raw)
          if (predicate(entry.key))
            rmSync(path)
        }
        catch {
          // skip unreadable files
        }
      }
    }
    catch {
      // dir doesn't exist — nothing to invalidate
    }
  }

  async clear(): Promise<void> {
    this.hot.clear()
    try {
      await rm(this.dir, { recursive: true, force: true })
      mkdirSync(this.dir, { recursive: true })
    }
    catch {
      // non-fatal
    }
  }
}
