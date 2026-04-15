import type { Cache } from './cache'
import type { TemplateReads } from './dev/reads'
import type { TemplateEngine } from './engine'
import type { Extractor, PackageFile } from './extractor'
import type { RendererProfile } from './profile'
import type { SymbolIndex } from './symbol-index'

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { DiskCache } from './cache'
import { InMemorySymbolIndex } from './symbol-index'

const RE_JS_EXT = /\.(js|mjs|cjs)$/

export interface VellumConfig {
  /** Project root - all other paths are resolved against this. */
  root: string

  /** Source roots to extract symbols from, per language. Paths relative to root. */
  sources: Record<string, {
    include: string[]
    /**
     * npm packages to extract types from. Each entry is a package specifier
     * (e.g. "next/font", "@tanstack/react-query"). Vellum resolves the
     * package's `.d.ts` entry point and extracts exported symbols from it.
     *
     * Symbols from packages use the package specifier as their module path
     * in SymbolIds, e.g. `ts:next/font#NextFont`.
     */
    packages?: string[]
  }>

  /** Template source directory (contains .vel files). Relative to root. */
  templates: string

  /** Output directory for generated files. Relative to root. */
  outDir: string

  extractors: Extractor[]
  engine: TemplateEngine
  profile: RendererProfile

  index?: SymbolIndex
  cache?: Cache

  /** Per-extractor config passthrough. */
  extractorConfig?: Record<string, unknown>
}

export interface BuildResult {
  templatesRendered: number
  symbolsExtracted: number
  filesWritten: string[]
}

async function hashFile(path: string): Promise<string> {
  const buf = await readFile(path)
  return createHash('sha1').update(buf).digest('hex')
}

export class Vellum {
  readonly config: VellumConfig
  readonly index: SymbolIndex
  readonly cache: Cache

  constructor(config: VellumConfig) {
    this.config = config
    this.index = config.index ?? new InMemorySymbolIndex()
    this.cache = config.cache ?? new DiskCache(resolve(config.root))
  }

  async extractAll(): Promise<number> {
    let count = 0
    for (const extractor of this.config.extractors) {
      const symbols = await this.extractLanguage(extractor)
      count += symbols.length
    }
    return count
  }

  /**
   * Re-extract a single language and add the results to the index. Returns
   * the full list of symbols produced (cache hits + fresh extractions).
   * Used by both `extractAll` and the watch-mode incremental loop. The
   * extractor is looked up either by a passed-in instance or by language key.
   */
  async extractLanguage(
    extractorOrLang: Extractor | string,
  ): Promise<import('./types.js').Symbol[]> {
    const extractor = typeof extractorOrLang === 'string'
      ? this.config.extractors.find(e => e.language === extractorOrLang)
      : extractorOrLang
    if (!extractor)
      return []

    const root = resolve(this.config.root)
    const langConfig = this.config.sources[extractor.language]
    if (!langConfig)
      return []

    const files = await this.resolveFiles(root, langConfig.include, extractor.extensions)
    const packageFiles = this.resolvePackages(root, langConfig.packages ?? [], extractor.extensions)

    const fresh: string[] = []
    const cachedSymbols: import('./types.js').Symbol[] = []

    for (const file of files) {
      const hash = await hashFile(file)
      const entry = await this.cache.get({
        language: extractor.language,
        file,
        hash,
      })
      if (entry)
        cachedSymbols.push(...entry.symbols)
      else
        fresh.push(file)
    }

    let extracted: import('./types.js').Symbol[] = []
    const hasWork = fresh.length > 0 || packageFiles.length > 0
    if (hasWork) {
      extracted = await extractor.extract({
        files: fresh,
        root,
        config: this.config.extractorConfig?.[extractor.language],
        packageFiles: packageFiles.length > 0 ? packageFiles : undefined,
      })

      const byFile = new Map<string, import('./types.js').Symbol[]>()
      for (const s of extracted) {
        const abs = resolve(root, s.source.file)
        const list = byFile.get(abs) ?? []
        list.push(s)
        byFile.set(abs, list)
      }
      for (const file of fresh) {
        const hash = await hashFile(file)
        await this.cache.set({
          key: { language: extractor.language, file, hash },
          symbols: byFile.get(file) ?? [],
        })
      }
    }

    const all = [...cachedSymbols, ...extracted]
    this.index.add(all)
    return all
  }

  async renderTemplates(): Promise<string[]> {
    const root = resolve(this.config.root)
    const templateRoot = resolve(root, this.config.templates)
    const ext = this.config.engine.sourceExtension
    const files = await this.walkFiles(templateRoot, name => name.endsWith(ext))
    const written: string[] = []

    for (const file of files) {
      const { outPath } = await this.renderTemplate(file)
      written.push(outPath)
    }

    return written
  }

  /**
   * List every `.vel` template under `config.templates`. Absolute paths,
   * sorted. Exposed for watch mode, which needs to prime the dependency
   * graph before the first file change arrives.
   */
  async listTemplates(): Promise<string[]> {
    const root = resolve(this.config.root)
    const templateRoot = resolve(root, this.config.templates)
    const ext = this.config.engine.sourceExtension
    return this.walkFiles(templateRoot, name => name.endsWith(ext))
  }

  /**
   * Render a single `.vel` template to disk. Returns the absolute output
   * path and the `TemplateReads` captured during render (only populated
   * when a `reads` argument is passed, so callers outside watch mode are
   * unaffected).
   *
   * NOT safe to call concurrently when `reads` is passed. The Nunjucks
   * engine installs per-render globals via `addGlobal` on a shared
   * Environment, and two in-flight renders would cross-pollinate each
   * other's `reads` closures. Watch mode renders templates sequentially
   * for this reason.
   */
  async renderTemplate(
    file: string,
    reads?: TemplateReads,
  ): Promise<{ outPath: string, reads?: TemplateReads }> {
    const root = resolve(this.config.root)
    const templateRoot = resolve(root, this.config.templates)
    const outRoot = resolve(root, this.config.outDir)
    const ext = this.config.engine.sourceExtension

    const source = await readFile(file, 'utf8')
    const result = await this.config.engine.render(source, {
      index: this.index,
      profile: this.config.profile,
      sourceFile: file,
      reads,
    })

    const rel = relative(templateRoot, file)
    const outRel = rel.slice(0, -ext.length)
    const outPath = join(outRoot, outRel)

    await mkdir(dirname(outPath), { recursive: true })
    const finalOutput = this.config.profile.postProcess
      ? this.config.profile.postProcess(result.output)
      : result.output
    await writeFile(outPath, finalOutput, 'utf8')
    return { outPath, reads: result.reads }
  }

  async build(): Promise<BuildResult> {
    const symbolsExtracted = await this.extractAll()
    const filesWritten = await this.renderTemplates()
    return {
      symbolsExtracted,
      templatesRendered: filesWritten.length,
      filesWritten,
    }
  }

  private resolvePackages(
    root: string,
    packages: string[],
    _extensions: readonly string[],
  ): PackageFile[] {
    if (packages.length === 0)
      return []
    const req = createRequire(resolve(root, 'package.json'))
    const results: PackageFile[] = []

    for (const pkg of packages) {
      try {
        const resolved = this.resolvePackageTypes(root, req, pkg)
        if (resolved) {
          results.push({ file: resolved, packageName: pkg })
        }
        else {
          console.warn(`vellum: could not resolve types for package "${pkg}" - skipping`)
        }
      }
      catch (err) {
        console.warn(`vellum: failed to resolve package "${pkg}" - ${err instanceof Error ? err.message : err}`)
      }
    }
    return results
  }

  /**
   * Try to find the .d.ts entry point for a package. Resolution order:
   * 1. Read package.json directly from node_modules (bypasses exports map)
   * 2. require.resolve("pkg/package.json") → read `types`/`typings` field
   * 3. require.resolve("pkg") with .d.ts extensions
   * 4. require.resolve("@types/pkg") as fallback
   */
  private resolvePackageTypes(root: string, req: NodeRequire, pkg: string): string | null {
    // Strategy 1: read package.json from disk, bypassing Node's exports
    // enforcement. ESM-only packages with strict exports maps often don't
    // expose ./package.json, causing require.resolve("pkg/package.json")
    // to throw ERR_PACKAGE_PATH_NOT_EXPORTED.
    const typesFromDisk = this.readTypesFromDisk(root, pkg)
    if (typesFromDisk)
      return typesFromDisk

    // Strategy 2: require.resolve("pkg/package.json") - works for packages
    // that do expose package.json in their exports map.
    try {
      const pkgJsonPath = req.resolve(`${pkg}/package.json`)
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
      const typesField: string | undefined
        = pkgJson.types ?? pkgJson.typings ?? pkgJson.exports?.['.']?.types
      if (typesField) {
        return resolve(dirname(pkgJsonPath), typesField)
      }
    }
    catch {
      // package.json not resolvable via require - already tried disk
    }

    // Strategy 3: require.resolve the package directly - works when main
    // points to a .d.ts or has a co-located .d.ts.
    try {
      const resolved = req.resolve(pkg)
      if (resolved.endsWith('.d.ts') || resolved.endsWith('.d.mts') || resolved.endsWith('.d.cts')) {
        return resolved
      }
      const dtsPath = resolved.replace(RE_JS_EXT, '.d.ts')
      if (existsSync(dtsPath))
        return dtsPath
    }
    catch {
      // not resolvable
    }

    // Strategy 4: @types/pkg fallback - try disk first, then require.resolve.
    const atTypes = `@types/${pkg.startsWith('@') ? pkg.slice(1).replace('/', '__') : pkg}`
    const atTypesDisk = this.readTypesFromDisk(root, atTypes)
    if (atTypesDisk)
      return atTypesDisk
    try {
      return req.resolve(atTypes)
    }
    catch {
      // no @types either
    }

    return null
  }

  /**
   * Read a package's types entry by looking at its package.json on disk,
   * bypassing Node module resolution entirely. This handles ESM-only
   * packages that don't expose ./package.json in their exports map.
   */
  private readTypesFromDisk(root: string, pkg: string): string | null {
    // Try direct node_modules path first, then walk up parent directories
    // (handles hoisted, nested, and pnpm symlinked layouts).
    let dir: string | null = root
    while (dir) {
      const pkgJsonPath = join(dir, 'node_modules', pkg, 'package.json')
      const result = this.readTypesField(pkgJsonPath)
      if (result)
        return result

      // Walk up to find hoisted node_modules
      const parent = dirname(dir)
      if (parent === dir)
        break
      dir = parent
    }
    return null
  }

  private readTypesField(pkgJsonPath: string): string | null {
    if (!existsSync(pkgJsonPath))
      return null
    try {
      // Follow symlinks to get the real path (pnpm uses symlinks)
      const realPkgJsonPath = realpathSync(pkgJsonPath)
      const pkgJson = JSON.parse(readFileSync(realPkgJsonPath, 'utf8'))
      const typesField: string | undefined
        = pkgJson.types
          ?? pkgJson.typings
          ?? pkgJson.exports?.['.']?.types
      if (typesField) {
        const resolved = resolve(dirname(realPkgJsonPath), typesField)
        if (existsSync(resolved))
          return resolved
      }
    }
    catch {
      // unreadable - skip
    }
    return null
  }

  private async resolveFiles(
    root: string,
    include: string[],
    extensions: readonly string[],
  ): Promise<string[]> {
    const results = new Set<string>()
    for (const pattern of include) {
      const base = resolve(root, pattern)
      let s
      try {
        s = await stat(base)
      }
      catch {
        continue
      }
      if (s.isFile()) {
        if (extensions.some(e => base.endsWith(e)))
          results.add(base)
      }
      else if (s.isDirectory()) {
        const files = await this.walkFiles(base, name =>
          extensions.some(e => name.endsWith(e)))
        for (const f of files) results.add(f)
      }
    }
    return Array.from(results).sort()
  }

  private async walkFiles(root: string, match: (name: string) => boolean): Promise<string[]> {
    const { readdir } = await import('node:fs/promises')
    const results: string[] = []

    const visit = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules')
          continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          await visit(full)
        }
        else if (entry.isFile() && match(entry.name)) {
          results.push(full)
        }
      }
    }

    try {
      const s = await stat(root)
      if (s.isDirectory())
        await visit(root)
    }
    catch {
      // missing directory - empty result
    }
    return results.sort()
  }
}

export { extname }
