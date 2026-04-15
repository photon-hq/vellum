import type { SymbolIndex } from '../symbol-index'
import type { SymbolDiff } from './diff'
import type { TemplateReads } from './reads'
import { matchesQuery } from '../symbol-index'

/**
 * Per-template map of recorded symbol reads. The key is the absolute path
 * to the `.vel` source file; the value is the read log captured on the
 * most recent successful render of that template.
 *
 * `affectedTemplates` returns the subset of template paths whose reads
 * intersect a given diff of extracted symbols - those are the templates
 * that must be re-rendered to stay in sync with source.
 */
export class DependencyGraph {
  private byTemplate = new Map<string, TemplateReads>()

  set(templatePath: string, reads: TemplateReads): void {
    this.byTemplate.set(templatePath, reads)
  }

  delete(templatePath: string): void {
    this.byTemplate.delete(templatePath)
  }

  get(templatePath: string): TemplateReads | undefined {
    return this.byTemplate.get(templatePath)
  }

  templates(): string[] {
    return Array.from(this.byTemplate.keys())
  }

  /**
   * Given a diff of extracted symbols, return the set of template paths
   * whose recorded reads intersect the diff. A template is affected when
   * any of:
   *   - a directly-looked-up id was added/removed/changed,
   *   - a directly-looked-up module had any member added/removed/changed,
   *   - a prior `symbols(query)` result member was removed or changed,
   *   - a newly-added symbol matches a prior `symbols(query)`.
   *
   * The fourth condition is why the index is needed: we re-check each
   * recorded query against the just-added symbols only (small set).
   */
  affectedTemplates(diff: SymbolDiff, index: SymbolIndex): Set<string> {
    const affected = new Set<string>()
    const touchedIds = new Set([...diff.added, ...diff.removed, ...diff.changed])
    const removedOrChanged = new Set([...diff.removed, ...diff.changed])

    const addedSymbols = [...diff.added]
      .map(id => index.symbol(id))
      .filter((s): s is NonNullable<typeof s> => s != null)

    for (const [tpl, reads] of this.byTemplate) {
      if (anyIntersect(reads.ids, touchedIds)) {
        affected.add(tpl)
        continue
      }
      if (anyIntersect(reads.modules, diff.changedModules)) {
        affected.add(tpl)
        continue
      }
      if (anyIntersect(reads.queryResultIds, removedOrChanged)) {
        affected.add(tpl)
        continue
      }
      if (addedSymbols.length > 0) {
        let hit = false
        for (const q of reads.queries) {
          for (const s of addedSymbols) {
            if (matchesQuery(s, q)) {
              hit = true
              break
            }
          }
          if (hit)
            break
        }
        if (hit)
          affected.add(tpl)
      }
    }

    return affected
  }

  clear(): void {
    this.byTemplate.clear()
  }
}

function anyIntersect<T>(a: Set<T>, b: Set<T>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const v of small) {
    if (large.has(v))
      return true
  }
  return false
}
