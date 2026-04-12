import type { Module, Symbol, SymbolId, SymbolKind } from './types.js'

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

export class InMemorySymbolIndex implements SymbolIndex {
  private byId = new Map<SymbolId, Symbol>()
  private byModule = new Map<string, Symbol[]>()

  add(symbols: Symbol[]): void {
    for (const s of symbols) {
      this.byId.set(s.id, s)
      const list = this.byModule.get(s.module) ?? []
      list.push(s)
      this.byModule.set(s.module, list)
    }
  }

  symbol(id: SymbolId): Symbol | null {
    return this.byId.get(id) ?? null
  }

  symbols(query: SymbolQuery = {}): Symbol[] {
    const kinds = query.kind
      ? Array.isArray(query.kind)
        ? new Set(query.kind)
        : new Set([query.kind])
      : null
    const exportedOnly = query.exportedOnly ?? true
    const moduleRe = query.module ? globToRegex(query.module) : null

    const results: Symbol[] = []
    for (const s of this.byId.values()) {
      if (exportedOnly && !s.exported)
        continue
      if (query.language && s.language !== query.language)
        continue
      if (kinds && !kinds.has(s.kind))
        continue
      if (moduleRe && !moduleRe.test(s.module))
        continue
      if (query.tag && !s.tags.includes(query.tag))
        continue
      if (query.customTag && !(query.customTag in s.doc.customTags))
        continue
      if (query.prefix && !s.name.startsWith(query.prefix))
        continue
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
  }
}
