import type { Module, Symbol, SymbolId, SymbolQuery, TemplateContext } from '@vellum-docs/core'

export interface GlobalFunctions {
  symbol: (id: SymbolId) => Symbol | null
  symbols: (query?: SymbolQuery) => Symbol[]
  module: (path: string) => Module | null
}

export function buildGlobals(ctx: TemplateContext): GlobalFunctions {
  const reads = ctx.reads
  if (!reads) {
    return {
      symbol: id => ctx.index.symbol(id),
      symbols: (query = {}) => ctx.index.symbols(query),
      module: path => ctx.index.module(path),
    }
  }
  return {
    symbol: (id) => {
      reads.ids.add(id)
      return ctx.index.symbol(id)
    },
    symbols: (query = {}) => {
      reads.queries.push(query)
      const result = ctx.index.symbols(query)
      for (const s of result) reads.queryResultIds.add(s.id)
      return result
    },
    module: (path) => {
      reads.modules.add(path)
      return ctx.index.module(path)
    },
  }
}
