import type { Extractor, PersistedSession, Symbol, SymbolDiff, VellumConfig } from '@vellum-docs/core'
import type { FSWatcher } from 'chokidar'
import type { Stats } from 'node:fs'
import { readdirSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import {
  createTemplateReads,
  DependencyGraph,
  diffSymbols,
  emptyDiff,
  fromPersistedReads,
  hashContent,
  isEmptyDiff,
  mergeDiffs,
  PERSISTED_SESSION_VERSION,
  readSession,
  sessionPath,
  toPersistedReads,
  Vellum,
  writeSession,
} from '@vellum-docs/core'
import chokidar from 'chokidar'
import { findConfig, loadConfig } from './config'
import { logger } from './logger'

export interface WatchCommandOptions {
  cwd: string
  configPath?: string
  strict?: boolean
}

/**
 * Directory names ignored anywhere in the watched tree. Only names that are
 * almost always build/VCS artifacts and that don't collide with plausible
 * source directory names. `dist` / `build` / `coverage` deliberately NOT
 * included - they're valid source subdirectory names in some projects and
 * output directories are already ignored via the explicit `outDirAbs`
 * check. Nested `node_modules` stays in the list because monorepos put them
 * at every depth.
 */
const GRANULAR_IGNORE = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  '.nuxt',
  '.vercel',
])
const DEBOUNCE_MS = 100

/**
 * Registry of every chokidar watcher created by this process. The shutdown
 * handler closes all registered watchers regardless of which `startSession`
 * generation they came from, which matters when a config reload is
 * mid-flight during Ctrl+C.
 */
const activeWatchers = new Set<FSWatcher>()

export async function runWatch(opts: WatchCommandOptions): Promise<void> {
  const cwd = resolve(opts.cwd)
  const configPath = opts.configPath
    ? resolve(cwd, opts.configPath)
    : findConfig(cwd)

  if (!configPath) {
    logger.error(
      `no config file found. Looked for vellum.config.{ts,mts,js,mjs} in ${cwd}`,
    )
    process.exit(1)
  }

  await startSession({ configPath, cwd, strict: opts.strict })
  logger.info(`watching for changes (Ctrl+C to exit)`)

  // Close every watcher still registered regardless of which session
  // generation created it - handles Ctrl+C during a config-reload restart.
  const shutdown = async (): Promise<void> => {
    await Promise.all([...activeWatchers].map(w => w.close().catch(() => {})))
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Keep the process alive. The session's watcher holds the event loop open,
  // but we also await a never-resolving promise to make intent explicit.
  await new Promise<void>(() => {})
}

interface Session {
  close: () => Promise<void>
}

interface StartOpts {
  configPath: string
  cwd: string
  strict?: boolean
}

async function startSession(opts: StartOpts): Promise<Session> {
  const config = await loadConfig(opts.configPath)
  if (!config.root)
    config.root = opts.cwd
  if (opts.strict === false && 'strict' in config.engine)
    (config.engine as { strict: boolean }).strict = false

  const root = resolve(config.root)
  const outDirAbs = resolve(root, config.outDir)
  const templatesAbs = resolve(root, config.templates)

  const vellum = new Vellum(config)
  const graph = new DependencyGraph()

  const start = Date.now()
  const symbolsExtracted = await vellum.extractAll()
  const templates = await vellum.listTemplates()

  // Attempt to skip priming by restoring the previous session's graph.
  // The restoration is trusted only if EVERY source file hash matches the
  // persisted snapshot - any source change between sessions invalidates
  // the entire cached graph, because the cross-symbol diff we'd need to
  // handle it surgically isn't persisted.
  const sessionFile = sessionPath(root)
  const restored = await tryRestoreSession(vellum, graph, templates, sessionFile, root)

  let rendered = 0
  let skipped = 0
  for (const tpl of templates) {
    if (restored && graph.get(tpl)) {
      skipped += 1
      continue
    }
    try {
      const reads = createTemplateReads()
      await vellum.renderTemplate(tpl, reads)
      graph.set(tpl, reads)
      rendered += 1
    }
    catch (err) {
      logger.error(`render failed for ${relative(root, tpl)}`)
      logger.error(errorMessage(err))
    }
  }
  const duration = Date.now() - start
  if (restored && skipped > 0) {
    logger.success(
      `primed ${rendered} + skipped ${skipped} templates (${symbolsExtracted} symbols) in ${duration}ms`,
    )
  }
  else {
    logger.success(
      `primed ${rendered}/${templates.length} templates (${symbolsExtracted} symbols) in ${duration}ms`,
    )
  }
  void persistSession(sessionFile, graph, root, vellum)

  const watcher = buildWatcher({
    config,
    root,
    outDirAbs,
    templatesAbs,
    configPath: opts.configPath,
  })
  activeWatchers.add(watcher)

  type ChangeKind = 'add' | 'change' | 'unlink'
  const pending = new Map<string, ChangeKind>()
  let drainTimer: NodeJS.Timeout | null = null
  let draining = false
  let rerunAfterDrain = false

  const currentSession: Session = {
    close: async () => {
      activeWatchers.delete(watcher)
      await watcher.close()
    },
  }

  const handleBatch = async (
    events: [string, ChangeKind][],
  ): Promise<void> => {
    const configChanged = events.some(([p]) => p === opts.configPath)
    if (configChanged) {
      logger.info(`config changed, reloading`)
      activeWatchers.delete(watcher)
      await watcher.close()
      const next = await startSession(opts)
      currentSession.close = next.close
      return
    }

    const sourceEvents: { path: string, kind: ChangeKind, lang: string }[] = []
    const templateEvents: { path: string, kind: ChangeKind }[] = []

    for (const [abs, kind] of events) {
      if (abs.startsWith(`${templatesAbs}${sep}`) || abs === templatesAbs) {
        if (abs.endsWith(config.engine.sourceExtension))
          templateEvents.push({ path: abs, kind })
        continue
      }
      const lang = languageForFile(abs, config.extractors)
      if (lang && isWithinSources(abs, config, root, lang))
        sourceEvents.push({ path: abs, kind, lang })
    }

    let diff: SymbolDiff = emptyDiff()

    if (sourceEvents.length > 0) {
      const byLang = new Map<string, { path: string, kind: ChangeKind }[]>()
      for (const e of sourceEvents) {
        const list = byLang.get(e.lang) ?? []
        list.push({ path: e.path, kind: e.kind })
        byLang.set(e.lang, list)
      }
      const langList = [...byLang.keys()].join(', ')
      logger.info(
        `${sourceEvents.length} source file(s) changed - re-extracting ${langList}...`,
      )

      for (const [lang, list] of byLang) {
        // Snapshot the affected files' current symbols, then remove them
        // from the index before re-extraction (so the fresh set isn't
        // merged-on-top of the stale one). If extraction fails, restore
        // the snapshot so the index doesn't end up partially populated -
        // templates that depended on those symbols stay renderable until
        // the user fixes the broken file.
        //
        // Cache is keyed by content hash, so a changed file naturally
        // misses. On unlink we don't bother deleting the stale entry -
        // it just becomes dead weight on disk.
        const prevByFile = new Map<string, Symbol[]>()
        for (const e of list) {
          const relFile = toRelFile(e.path, root)
          prevByFile.set(relFile, vellum.index.symbolsByFile(relFile))
          vellum.index.removeByFile(relFile)
        }

        let extracted: Symbol[] = []
        try {
          extracted = await vellum.extractLanguage(lang)
        }
        catch (err) {
          for (const prev of prevByFile.values()) vellum.index.add(prev)
          logger.error(`extractor '${lang}' failed - keeping previous symbols`)
          logger.error(errorMessage(err))
          continue
        }

        for (const [relFile, prev] of prevByFile) {
          const next = extracted.filter(s => s.source.file === relFile)
          const fileDiff = diffSymbols(prev, next)
          diff = mergeDiffs(diff, fileDiff)
        }
      }
    }

    const affected = isEmptyDiff(diff)
      ? new Set<string>()
      : graph.affectedTemplates(diff, vellum.index)

    for (const ev of templateEvents) {
      if (ev.kind === 'unlink') {
        graph.delete(ev.path)
        continue
      }
      affected.add(ev.path)
    }

    if (affected.size === 0) {
      if (!isEmptyDiff(diff))
        logger.info(`symbols changed, no templates affected`)
      return
    }

    for (const tpl of affected) {
      const exists = await pathExists(tpl)
      if (!exists) {
        graph.delete(tpl)
        continue
      }
      try {
        const reads = createTemplateReads()
        const { outPath } = await vellum.renderTemplate(tpl, reads)
        graph.set(tpl, reads)
        logger.success(`re-rendered ${relative(root, outPath)}`)
      }
      catch (err) {
        logger.error(`render failed for ${relative(root, tpl)}`)
        logger.error(errorMessage(err))
      }
    }
    // Fire-and-forget; errors are logged inside.
    void persistSession(sessionFile, graph, root, vellum)
  }

  const drain = async (): Promise<void> => {
    if (draining) {
      rerunAfterDrain = true
      return
    }
    draining = true
    try {
      const batch = Array.from(pending.entries())
      pending.clear()
      await handleBatch(batch)
    }
    finally {
      draining = false
      if (rerunAfterDrain) {
        rerunAfterDrain = false
        void drain()
      }
    }
  }

  const schedule = (path: string, kind: ChangeKind): void => {
    pending.set(resolve(path), kind)
    if (drainTimer)
      clearTimeout(drainTimer)
    drainTimer = setTimeout(() => {
      drainTimer = null
      void drain()
    }, DEBOUNCE_MS)
  }

  watcher.on('add', path => schedule(path, 'add'))
  watcher.on('change', path => schedule(path, 'change'))
  watcher.on('unlink', path => schedule(path, 'unlink'))
  watcher.on('error', err => logger.error(`watcher error`, err))

  return currentSession
}

interface WatcherDeps {
  config: VellumConfig
  root: string
  outDirAbs: string
  templatesAbs: string
  configPath: string
}

function buildWatcher(deps: WatcherDeps): FSWatcher {
  const { config, root, outDirAbs, templatesAbs, configPath } = deps

  const sourceRoots = new Set<string>()
  for (const lang of Object.keys(config.sources)) {
    for (const entry of config.sources[lang]!.include) {
      const abs = resolve(root, entry)
      // If the include entry points at a top-level directory like `src`,
      // watch it directly. If it points at the project root, expand via
      // granular paths so we never recurse into node_modules/etc.
      for (const p of expandGranular(abs, outDirAbs))
        sourceRoots.add(p)
    }
  }

  const paths: string[] = [
    ...sourceRoots,
    templatesAbs,
    configPath,
  ]

  const extensionByLang = new Map<string, readonly string[]>()
  for (const e of config.extractors) extensionByLang.set(e.language, e.extensions)
  const sourceExt = config.engine.sourceExtension

  return chokidar.watch(paths, {
    ignoreInitial: true,
    persistent: true,
    followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
    ignored: (p: string, stats?: Stats) => {
      if (p === configPath)
        return false
      // Ignore granular-excluded directories anywhere in the tree.
      const parts = p.split(sep)
      for (const part of parts) {
        if (GRANULAR_IGNORE.has(part))
          return true
      }
      // Ignore anything inside outDir.
      if (p === outDirAbs || p.startsWith(`${outDirAbs}${sep}`))
        return true
      if (!stats)
        return false
      if (stats.isDirectory())
        return false
      // File-level extension filter: only accept source-language files and
      // .vel templates. The config file is allowed via the equality check
      // above.
      if (p.startsWith(`${templatesAbs}${sep}`) || p === templatesAbs)
        return !p.endsWith(sourceExt)
      for (const exts of extensionByLang.values()) {
        if (exts.some(ext => p.endsWith(ext)))
          return false
      }
      return true
    },
  })
}

function expandGranular(dir: string, outDirAbs: string): string[] {
  let entries: { name: string, isDir: boolean }[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map(d => ({
      name: d.name,
      isDir: d.isDirectory(),
    }))
  }
  catch {
    return [dir]
  }
  // Only expand if the directory contains one of the granular-ignored names
  // at its top level (i.e. it's plausibly the project root). Otherwise
  // watching it directly is already narrow enough.
  const hasIgnorable = entries.some(e => GRANULAR_IGNORE.has(e.name))
  if (!hasIgnorable)
    return [dir]
  const out: string[] = []
  for (const e of entries) {
    if (GRANULAR_IGNORE.has(e.name))
      continue
    if (e.name.startsWith('.'))
      continue
    const full = resolve(dir, e.name)
    if (full === outDirAbs || full.startsWith(`${outDirAbs}${sep}`))
      continue
    out.push(full)
  }
  return out
}

function languageForFile(
  abs: string,
  extractors: readonly Extractor[],
): string | null {
  for (const e of extractors) {
    if (e.extensions.some(ext => abs.endsWith(ext)))
      return e.language
  }
  return null
}

function isWithinSources(
  abs: string,
  config: VellumConfig,
  root: string,
  lang: string,
): boolean {
  const includes = config.sources[lang]?.include ?? []
  for (const entry of includes) {
    const base = resolve(root, entry)
    if (abs === base || abs.startsWith(`${base}${sep}`))
      return true
  }
  return false
}

function toRelFile(abs: string, root: string): string {
  return relative(root, abs).split(sep).join('/')
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  }
  catch {
    return false
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.stack ?? err.message
  return String(err)
}

/**
 * Build a { relative-path → content-hash } map for every source file the
 * current extraction covers. Keys are relative-to-`root` so the snapshot is
 * portable between machines; absolute paths would force a re-prime any time
 * the repo moved.
 */
async function snapshotSourceHashes(vellum: Vellum, root: string): Promise<Array<[string, string]>> {
  const out: Array<[string, string]> = []
  const files = new Set<string>()
  for (const sym of vellum.index.all()) files.add(sym.source.file)
  for (const file of files) {
    try {
      const abs = resolve(root, file)
      const buf = await readFile(abs)
      out.push([file, hashContent(buf)])
    }
    catch {
      // File gone - skip; the next session will notice it's missing too.
    }
  }
  out.sort((a, b) => a[0].localeCompare(b[0]))
  return out
}

async function tryRestoreSession(
  vellum: Vellum,
  graph: DependencyGraph,
  templates: string[],
  sessionFile: string,
  root: string,
): Promise<boolean> {
  const persisted = await readSession(sessionFile)
  if (!persisted)
    return false

  // Current source hashes must match EXACTLY for restoration to be safe.
  // Any add/remove/change means the persisted reads may be stale.
  const current = await snapshotSourceHashes(vellum, root)
  if (current.length !== persisted.sources.length)
    return false
  for (let i = 0; i < current.length; i++) {
    if (current[i]![0] !== persisted.sources[i]![0]
      || current[i]![1] !== persisted.sources[i]![1]) {
      return false
    }
  }

  // Restore each template entry iff the template's content hash is
  // unchanged. A changed template still gets re-rendered below.
  const templateSet = new Set(templates)
  for (const entry of persisted.templates) {
    if (!templateSet.has(entry.path))
      continue
    try {
      const content = await readFile(entry.path, 'utf8')
      if (hashContent(content) !== entry.contentHash)
        continue
      graph.set(entry.path, fromPersistedReads(entry.reads))
    }
    catch {
      // Template disappeared - skip.
    }
  }
  return true
}

async function persistSession(
  sessionFile: string,
  graph: DependencyGraph,
  root: string,
  vellum: Vellum,
): Promise<void> {
  try {
    const sources = await snapshotSourceHashes(vellum, root)
    const templates: PersistedSession['templates'] = []
    for (const path of graph.templates()) {
      const reads = graph.get(path)
      if (!reads)
        continue
      try {
        const content = await readFile(path, 'utf8')
        templates.push({
          path,
          contentHash: hashContent(content),
          reads: toPersistedReads(reads),
        })
      }
      catch {
        // Template gone - omit.
      }
    }
    await writeSession(sessionFile, {
      version: PERSISTED_SESSION_VERSION,
      templates,
      sources,
    })
  }
  catch (err) {
    // Persistence is best-effort; don't let an I/O error crash the watcher.
    logger.warn(`failed to persist watch session: ${errorMessage(err)}`)
  }
}
