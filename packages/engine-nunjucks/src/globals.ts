import type { Module, Symbol, SymbolId, SymbolQuery, TemplateContext } from '@vellum-docs/core'

export interface GlobalFunctions {
  symbol: (id: SymbolId) => Symbol | null
  symbols: (query?: SymbolQuery) => Symbol[]
  module: (path: string) => Module | null
}

export function buildGlobals(ctx: TemplateContext): GlobalFunctions {
  return {
    symbol: id => ctx.index.symbol(id),
    symbols: (query = {}) => ctx.index.symbols(query),
    module: path => ctx.index.module(path),
  }
}
