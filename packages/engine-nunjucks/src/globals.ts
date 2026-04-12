import type { Module, Symbol, SymbolId, TemplateContext } from "@vellum-docs/core";
import type { SymbolQuery } from "@vellum-docs/core";

export interface GlobalFunctions {
  symbol: (id: SymbolId) => Symbol | null;
  symbols: (query?: SymbolQuery) => Symbol[];
  module: (path: string) => Module | null;
}

export const buildGlobals = (ctx: TemplateContext): GlobalFunctions => ({
  symbol: (id) => ctx.index.symbol(id),
  symbols: (query = {}) => ctx.index.symbols(query),
  module: (path) => ctx.index.module(path),
});
