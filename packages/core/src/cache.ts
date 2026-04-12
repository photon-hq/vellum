import type { Symbol } from "./types.js";

export interface CacheKey {
  language: string;
  file: string;
  hash: string;
}

export interface CacheEntry {
  key: CacheKey;
  symbols: Symbol[];
}

export interface Cache {
  get(key: CacheKey): Promise<CacheEntry | null>;
  set(entry: CacheEntry): Promise<void>;
  invalidate(predicate: (key: CacheKey) => boolean): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryCache implements Cache {
  private store = new Map<string, CacheEntry>();

  private toKey(k: CacheKey): string {
    return `${k.language}:${k.file}:${k.hash}`;
  }

  async get(key: CacheKey): Promise<CacheEntry | null> {
    return this.store.get(this.toKey(key)) ?? null;
  }

  async set(entry: CacheEntry): Promise<void> {
    this.store.set(this.toKey(entry.key), entry);
  }

  async invalidate(predicate: (key: CacheKey) => boolean): Promise<void> {
    for (const [k, entry] of this.store) {
      if (predicate(entry.key)) this.store.delete(k);
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
