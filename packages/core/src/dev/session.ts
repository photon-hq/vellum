import type { Buffer } from 'node:buffer'
import type { SymbolQuery } from '../symbol-index'
import type { SymbolId } from '../types'
import type { TemplateReads } from './reads'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

/**
 * Bump when the persisted shape changes in a way that old snapshots can't
 * be trusted for. Mismatched versions are treated as absent - we prime from
 * scratch rather than mis-interpret stale JSON.
 */
export const PERSISTED_SESSION_VERSION = 1

interface PersistedReads {
  ids: string[]
  modules: string[]
  queries: SymbolQuery[]
  queryResultIds: string[]
}

export interface PersistedSession {
  version: number
  /**
   * Per-template entries from the dependency graph. `contentHash` is the
   * SHA-1 of the template source - when it drifts we discard the entry
   * and re-render.
   */
  templates: Array<{
    path: string
    contentHash: string
    reads: PersistedReads
  }>
  /**
   * Hashes of every source file that contributed to the session. If *any*
   * hash changes between sessions we re-prime from scratch rather than
   * trust potentially-stale reads.
   */
  sources: Array<[file: string, hash: string]>
}

export function toPersistedReads(r: TemplateReads): PersistedReads {
  return {
    ids: [...r.ids],
    modules: [...r.modules],
    queries: [...r.queries],
    queryResultIds: [...r.queryResultIds],
  }
}

export function fromPersistedReads(r: PersistedReads): TemplateReads {
  return {
    ids: new Set(r.ids as SymbolId[]),
    modules: new Set(r.modules),
    queries: [...r.queries],
    queryResultIds: new Set(r.queryResultIds as SymbolId[]),
  }
}

export function sessionPath(root: string): string {
  return resolve(root, 'node_modules/.cache/vellum/watch-session.json')
}

export function hashContent(content: string | Buffer): string {
  return createHash('sha1').update(content).digest('hex')
}

export async function readSession(filepath: string): Promise<PersistedSession | null> {
  try {
    const buf = await readFile(filepath, 'utf8')
    const parsed = JSON.parse(buf) as PersistedSession
    if (parsed.version !== PERSISTED_SESSION_VERSION)
      return null
    return parsed
  }
  catch {
    return null
  }
}

export async function writeSession(filepath: string, session: PersistedSession): Promise<void> {
  await mkdir(dirname(filepath), { recursive: true })
  const tmp = `${filepath}.tmp-${process.pid}`
  await writeFile(tmp, JSON.stringify(session), 'utf8')
  // Atomic swap so a crash mid-write never leaves a truncated session file.
  await rename(tmp, filepath)
}
