import type { Symbol, SymbolId } from '../types'
import { createHash } from 'node:crypto'

export interface SymbolDiff {
  added: Set<SymbolId>
  removed: Set<SymbolId>
  changed: Set<SymbolId>
  changedModules: Set<string>
}

/**
 * Stable content hash of a Symbol that ignores source positions. Line/column
 * shifts from editing other parts of a file must not invalidate templates
 * that depend only on the symbol's meaning.
 */
export function hashSymbol(sym: Symbol): string {
  const clone = { ...sym, source: { ...sym.source, line: 0, column: 0, endLine: 0, endColumn: 0 } }
  return createHash('sha1').update(JSON.stringify(clone)).digest('hex')
}

export function diffSymbols(prev: Symbol[], next: Symbol[]): SymbolDiff {
  const prevById = new Map<SymbolId, Symbol>()
  for (const s of prev) prevById.set(s.id, s)
  const nextById = new Map<SymbolId, Symbol>()
  for (const s of next) nextById.set(s.id, s)

  const added = new Set<SymbolId>()
  const removed = new Set<SymbolId>()
  const changed = new Set<SymbolId>()
  const changedModules = new Set<string>()

  for (const [id, n] of nextById) {
    const p = prevById.get(id)
    if (!p) {
      added.add(id)
      changedModules.add(n.module)
      continue
    }
    if (hashSymbol(p) !== hashSymbol(n)) {
      changed.add(id)
      changedModules.add(n.module)
    }
  }

  for (const [id, p] of prevById) {
    if (!nextById.has(id)) {
      removed.add(id)
      changedModules.add(p.module)
    }
  }

  return { added, removed, changed, changedModules }
}

export function mergeDiffs(a: SymbolDiff, b: SymbolDiff): SymbolDiff {
  return {
    added: new Set([...a.added, ...b.added]),
    removed: new Set([...a.removed, ...b.removed]),
    changed: new Set([...a.changed, ...b.changed]),
    changedModules: new Set([...a.changedModules, ...b.changedModules]),
  }
}

export function emptyDiff(): SymbolDiff {
  return {
    added: new Set(),
    removed: new Set(),
    changed: new Set(),
    changedModules: new Set(),
  }
}

export function isEmptyDiff(d: SymbolDiff): boolean {
  return d.added.size === 0 && d.removed.size === 0 && d.changed.size === 0
}
