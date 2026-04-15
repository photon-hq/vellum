import type { Extractor, Symbol, SymbolDiff, VellumConfig } from '@vellum-docs/core'
import type { FSWatcher } from 'chokidar'
import type { Stats } from 'node:fs'
import { readdirSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import {
  createTemplateReads,
  DependencyGraph,
  diffSymbols,
  emptyDiff,
  isEmptyDiff,
  mergeDiffs,
  Vellum,
} from '@vellum-docs/core'
import chokidar from 'chokidar'
import { findConfig, loadConfig } from './config'

export interface WatchCommandOptions {
  cwd: string
  configPath?: string
  strict?: boolean
}

const GRANULAR_IGNORE = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  '.nuxt',
  '.vercel',
  'dist',
  'build',
  'coverage',
])
const DEBOUNCE_MS = 100

export async function runWatch(opts: WatchCommandOptions): Promise<void> {
  const cwd = resolve(opts.cwd)
  const configPath = opts.configPath
    ? resolve(cwd, opts.configPath)
    : findConfig(cwd)

  if (!configPath) {
    console.error(
      `vellum: no config file found. Looked for vellum.config.{ts,mts,js,mjs} in ${cwd}`,
    )
    process.exit(1)
  }

  const session = await startSession({ configPath, cwd, strict: opts.strict })
  console.log(`vellum: watching for changes (Ctrl+C to exit)`)

  const shutdown = async (): Promise<void> => {
    await session.close()
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
  let rendered = 0
  for (const tpl of templates) {
    try {
      const reads = createTemplateReads()
      await vellum.renderTemplate(tpl, reads)
      graph.set(tpl, reads)
      rendered += 1
    }
    catch (err) {
      console.error(`vellum: render failed for ${relative(root, tpl)}`)
      console.error(errorMessage(err))
    }
  }
  const duration = Date.now() - start
  console.log(
    `vellum: primed ${rendered}/${templates.length} templates (${symbolsExtracted} symbols) in ${duration}ms`,
  )

  const watcher = buildWatcher({
    config,
    root,
    outDirAbs,
    templatesAbs,
    configPath: opts.configPath,
  })

  type ChangeKind = 'add' | 'change' | 'unlink'
  const pending = new Map<string, ChangeKind>()
  let drainTimer: NodeJS.Timeout | null = null
  let draining = false
  let rerunAfterDrain = false

  const currentSession: Session = {
    close: async () => {
      await watcher.close()
    },
  }

  const handleBatch = async (
    events: [string, ChangeKind][],
  ): Promise<void> => {
    const configChanged = events.some(([p]) => p === opts.configPath)
    if (configChanged) {
      console.log(`vellum: config changed, reloading`)
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

      for (const [lang, list] of byLang) {
        const prevByFile = new Map<string, Symbol[]>()
        for (const e of list) {
          const relFile = toRelFile(e.path, root)
          prevByFile.set(relFile, vellum.index.symbolsByFile(relFile))
          vellum.index.removeByFile(relFile)
          // Cache is keyed by content hash, so a changed file naturally
          // misses. On unlink we don't bother deleting the stale entry -
          // it just becomes dead weight on disk.
        }

        let extracted: Symbol[] = []
        try {
          extracted = await vellum.extractLanguage(lang)
        }
        catch (err) {
          console.error(`vellum: extractor '${lang}' failed`)
          console.error(errorMessage(err))
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
        console.log(`vellum: symbols changed, no templates affected`)
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
        console.log(`vellum: re-rendered ${relative(root, outPath)}`)
      }
      catch (err) {
        console.error(`vellum: render failed for ${relative(root, tpl)}`)
        console.error(errorMessage(err))
      }
    }
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
  watcher.on('error', err => console.error(`vellum: watcher error`, err))

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
