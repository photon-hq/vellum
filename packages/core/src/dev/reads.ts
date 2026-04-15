import type { SymbolQuery } from '../symbol-index'
import type { SymbolId } from '../types'

export interface TemplateReads {
  ids: Set<SymbolId>
  modules: Set<string>
  queries: SymbolQuery[]
  queryResultIds: Set<SymbolId>
}

export function createTemplateReads(): TemplateReads {
  return {
    ids: new Set(),
    modules: new Set(),
    queries: [],
    queryResultIds: new Set(),
  }
}
