import type { RenderResult, TemplateContext, TemplateEngine } from '@vellum-docs/core'
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
   * Fail the build when a template outputs an undefined value (typo
   * like `{{ fn.doc.summaryy }}`, missing field access, etc.). Default
   * `true` - we'd rather fail loudly than ship empty sections. Set to
   * `false` to fall back to legacy "undefined → empty string" behavior.
   */
  strict?: boolean
}

const here = dirname(fileURLToPath(import.meta.url))
const builtinPartialsDir = resolve(here, './partials')

export class NunjucksEngine implements TemplateEngine {
  readonly name = 'nunjucks'
  readonly sourceExtension: string

  /** Mutable so the CLI's `--no-strict` flag can flip it after config load. */
  strict: boolean

  private readonly searchPaths: string[]
  private readonly extraGlobals: Record<string, unknown>
  private readonly extraFilters: Record<string, (...args: unknown[]) => unknown>

  constructor(opts: NunjucksEngineOptions = {}) {
    this.sourceExtension = opts.sourceExtension ?? '.vel'
    this.searchPaths = [builtinPartialsDir, ...(opts.searchPaths ?? [])]
    this.extraGlobals = opts.globals ?? {}
    this.extraFilters = opts.filters ?? {}
    this.strict = opts.strict ?? true
  }

  async render(source: string, ctx: TemplateContext): Promise<RenderResult> {
    const env = new nunjucks.Environment(
      new nunjucks.FileSystemLoader(this.searchPaths, {
        noCache: true,
        watch: false,
      }),
      { autoescape: false, throwOnUndefined: this.strict, trimBlocks: false, lstripBlocks: false },
    )

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

    const globals = buildGlobals(ctx)
    for (const [k, v] of Object.entries(globals)) env.addGlobal(k, v as never)
    for (const [k, v] of Object.entries(this.extraGlobals)) env.addGlobal(k, v as never)

    const filters = buildFilters(ctx)
    for (const [k, v] of Object.entries(filters)) env.addFilter(k, v)
    for (const [k, v] of Object.entries(this.extraFilters)) env.addFilter(k, v)

    const output = await new Promise<string>((resolvePromise, reject) => {
      env.renderString(source, {}, (err, result) => {
        if (err)
          reject(err)
        else resolvePromise(result ?? '')
      })
    })
    return ctx.reads ? { output, reads: ctx.reads } : { output }
  }
}
