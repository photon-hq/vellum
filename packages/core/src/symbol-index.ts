import type { Module, Symbol, SymbolId, SymbolKind } from './types'

export interface SymbolQuery {
  module?: string
  kind?: SymbolKind | SymbolKind[]
  language?: string
  tag?: string
  customTag?: string
  prefix?: string
  exportedOnly?: boolean
}

export interface SymbolIndex {
  add: (symbols: Symbol[]) => void
  symbol: (id: SymbolId) => Symbol | null
  symbols: (query?: SymbolQuery) => Symbol[]
  module: (path: string) => Module | null
  all: () => Symbol[]
  clear: () => void
  /**
   * All symbols that were added from a given source file (matched by
   * `Symbol.source.file`, which extractors normalize to a forward-slash
   * path relative to the project root).
   */
  symbolsByFile: (file: string) => Symbol[]
  /**
   * Remove every symbol previously added from a given source file.
   * Returns the removed ids.
   */
  removeByFile: (file: string) => SymbolId[]
}

function globToRegex(glob: string): RegExp {
  let src = ''
  let i = 0
  while (i < glob.length) {
    const c = glob[i]!
    if (c === '*' && glob[i + 1] === '*') {
      src += '.*'
      i += 2
      if (glob[i] === '/')
        i += 1
    }
    else if (c === '*') {
      src += '[^/]*'
      i += 1
    }
    else if (c === '?') {
      src += '[^/]'
      i += 1
    }
    else if ('+^$.()|{}[]\\'.includes(c)) {
      src += `\\${c}`
      i += 1
    }
    else {
      src += c
      i += 1
    }
  }
  return new RegExp(`^${src}$`)
}

/**
 * Predicate equivalent to `InMemorySymbolIndex.symbols(query)` applied to a
 * single symbol. Exported so dev-mode invalidation can reuse the exact same
 * match semantics when deciding whether a newly-added symbol satisfies a
 * previously-recorded template query.
 */
export function matchesQuery(sym: Symbol, query: SymbolQuery = {}): boolean {
  const exportedOnly = query.exportedOnly ?? true
  if (exportedOnly && !sym.exported)
    return false
  if (query.language && sym.language !== query.language)
    return false
  if (query.kind) {
    const kinds = Array.isArray(query.kind) ? query.kind : [query.kind]
    if (!kinds.includes(sym.kind))
      return false
  }
  if (query.module) {
    const re = globToRegex(query.module)
    if (!re.test(sym.module))
      return false
  }
  if (query.tag && !sym.tags.includes(query.tag))
    return false
  if (query.customTag && !(query.customTag in sym.doc.customTags))
    return false
  if (query.prefix && !sym.name.startsWith(query.prefix))
    return false
  return true
}

export class InMemorySymbolIndex implements SymbolIndex {
  private byId = new Map<SymbolId, Symbol>()
  private byModule = new Map<string, Symbol[]>()
  private byFile = new Map<string, Set<SymbolId>>()

  add(symbols: Symbol[]): void {
    for (const s of symbols) {
      this.byId.set(s.id, s)
      const list = this.byModule.get(s.module) ?? []
      list.push(s)
      this.byModule.set(s.module, list)

      const file = s.source.file
      const ids = this.byFile.get(file) ?? new Set<SymbolId>()
      ids.add(s.id)
      this.byFile.set(file, ids)
    }
  }

  symbol(id: SymbolId): Symbol | null {
    return this.byId.get(id) ?? null
  }

  symbols(query: SymbolQuery = {}): Symbol[] {
    const results: Symbol[] = []
    for (const s of this.byId.values()) {
      if (matchesQuery(s, query))
        results.push(s)
    }
    results.sort((a, b) => a.name.localeCompare(b.name))
    return results
  }

  module(path: string): Module | null {
    const list = this.byModule.get(path)
    if (!list)
      return null
    return { path, exports: list.filter(s => s.exported) }
  }

  all(): Symbol[] {
    return Array.from(this.byId.values())
  }

  clear(): void {
    this.byId.clear()
    this.byModule.clear()
    this.byFile.clear()
  }

  symbolsByFile(file: string): Symbol[] {
    const ids = this.byFile.get(file)
    if (!ids)
      return []
    const out: Symbol[] = []
    for (const id of ids) {
      const s = this.byId.get(id)
      if (s)
        out.push(s)
    }
    return out
  }

  removeByFile(file: string): SymbolId[] {
    const ids = this.byFile.get(file)
    if (!ids)
      return []
    const removed: SymbolId[] = []
    for (const id of ids) {
      const s = this.byId.get(id)
      if (!s)
        continue
      this.byId.delete(id)
      const modList = this.byModule.get(s.module)
      if (modList) {
        const filtered = modList.filter(m => m.id !== id)
        if (filtered.length === 0)
          this.byModule.delete(s.module)
        else
          this.byModule.set(s.module, filtered)
      }
      removed.push(id)
    }
    this.byFile.delete(file)
    return removed
  }
}
