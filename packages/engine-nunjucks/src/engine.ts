import type { TemplateContext, TemplateEngine } from '@vellum-docs/core'
import { dirname, resolve } from 'node:path'

import { fileURLToPath } from 'node:url'

import nunjucks from 'nunjucks'

import { buildFilters } from './filters'
import { buildGlobals } from './globals'

export interface NunjucksEngineOptions {
  /** Extra directories to resolve `{% include %}` / `{% extends %}` from. */
  searchPaths?: string[]

  /** Additional Nunjucks globals (merged with built-ins). */
  globals?: Record<string, unknown>

  /** Additional Nunjucks filters (merged with built-ins). */
  filters?: Record<string, (...args: unknown[]) => unknown>

  /** Override the source extension (default `.vel`). */
  sourceExtension?: string

  /**
   * Enable HTML auto-escaping (default `false`).
   *
   * Markdown targets are safe with `false` because the renderer handles
   * escaping.  Set to `true` when targeting `.html` files to prevent XSS
   * from TSDoc summaries containing raw HTML.
   */
  autoescape?: boolean
}

const here = dirname(fileURLToPath(import.meta.url))
const builtinPartialsDir = resolve(here, './partials')

export class NunjucksEngine implements TemplateEngine {
  readonly name = 'nunjucks'
  readonly sourceExtension: string

  /**
   * Shared loader — built once so N renders don't create N file-system loaders.
   * Each render() call creates a lightweight Environment from this loader,
   * keeping renders reentrant-safe (no shared mutable global/filter state).
   */
  private readonly loader: nunjucks.ILoader
  private readonly autoescape: boolean
  private readonly extraGlobals: Record<string, unknown>
  private readonly extraFilters: Record<string, (...args: unknown[]) => unknown>

  constructor(opts: NunjucksEngineOptions = {}) {
    this.sourceExtension = opts.sourceExtension ?? '.vel'
    this.autoescape = opts.autoescape ?? false
    this.extraGlobals = opts.globals ?? {}
    this.extraFilters = opts.filters ?? {}

    const loader = new nunjucks.FileSystemLoader(
      [builtinPartialsDir, ...(opts.searchPaths ?? [])],
      { noCache: true, watch: false },
    )
    // Each createEnv() call attaches listeners to the shared loader.
    // Raise the limit to avoid spurious warnings during long builds.
    if (typeof (loader as unknown as NodeJS.EventEmitter).setMaxListeners === 'function')
      (loader as unknown as NodeJS.EventEmitter).setMaxListeners(0)
    this.loader = loader
  }

  private createEnv(): nunjucks.Environment {
    const env = new nunjucks.Environment(this.loader, {
      autoescape: this.autoescape,
      throwOnUndefined: false,
      trimBlocks: false,
      lstripBlocks: false,
    })

    // Path alias: `{% include "@vellum-docs/partials/..." %}` → built-in partials dir.
    type GetTemplateFn = (name: string, ...rest: unknown[]) => unknown
    const originalGetTemplate = (env as unknown as { getTemplate: GetTemplateFn }).getTemplate.bind(env);
    (env as unknown as { getTemplate: GetTemplateFn }).getTemplate = function (
      name: string,
      ...rest: unknown[]
    ) {
      const resolved = name.startsWith('@vellum-docs/partials/')
        ? name.slice('@vellum-docs/partials/'.length)
        : name
      return originalGetTemplate(resolved, ...rest)
    }

    // Register static extra globals and filters.
    for (const [k, v] of Object.entries(this.extraGlobals)) env.addGlobal(k, v as never)
    for (const [k, v] of Object.entries(this.extraFilters)) env.addFilter(k, v)

    return env
  }

  async render(source: string, ctx: TemplateContext): Promise<string> {
    // Fresh environment per render — the shared loader avoids repeated FS
    // setup, while per-render environments keep globals/filters isolated.
    const env = this.createEnv()

    const globals = buildGlobals(ctx)
    for (const [k, v] of Object.entries(globals)) env.addGlobal(k, v as never)

    const filters = buildFilters(ctx)
    for (const [k, v] of Object.entries(filters)) env.addFilter(k, v)

    return new Promise<string>((resolvePromise, reject) => {
      env.renderString(source, {}, (err, result) => {
        if (err)
          reject(err)
        else resolvePromise(result ?? '')
      })
    })
  }
}
