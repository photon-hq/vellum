import type { TemplateContext, TemplateEngine } from '@vellum-docs/core'
import { dirname, resolve } from 'node:path'

import { fileURLToPath } from 'node:url'

import nunjucks from 'nunjucks'

import { buildFilters } from './filters.js'
import { buildGlobals } from './globals.js'

export interface NunjucksEngineOptions {
  /** Extra directories to resolve `{% include %}` / `{% extends %}` from. */
  searchPaths?: string[]

  /** Additional Nunjucks globals (merged with built-ins). */
  globals?: Record<string, unknown>

  /** Additional Nunjucks filters (merged with built-ins). */
  filters?: Record<string, (...args: unknown[]) => unknown>

  /** Override the source extension (default `.vel`). */
  sourceExtension?: string
}

const here = dirname(fileURLToPath(import.meta.url))
const builtinPartialsDir = resolve(here, './partials')

export class NunjucksEngine implements TemplateEngine {
  readonly name = 'nunjucks'
  readonly sourceExtension: string

  private readonly searchPaths: string[]
  private readonly extraGlobals: Record<string, unknown>
  private readonly extraFilters: Record<string, (...args: unknown[]) => unknown>

  constructor(opts: NunjucksEngineOptions = {}) {
    this.sourceExtension = opts.sourceExtension ?? '.vel'
    this.searchPaths = [builtinPartialsDir, ...(opts.searchPaths ?? [])]
    this.extraGlobals = opts.globals ?? {}
    this.extraFilters = opts.filters ?? {}
  }

  async render(source: string, ctx: TemplateContext): Promise<string> {
    const env = new nunjucks.Environment(
      new nunjucks.FileSystemLoader(this.searchPaths, {
        noCache: true,
        watch: false,
      }),
      { autoescape: false, throwOnUndefined: false, trimBlocks: false, lstripBlocks: false },
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

    return new Promise<string>((resolvePromise, reject) => {
      env.renderString(source, {}, (err, result) => {
        if (err)
          reject(err)
        else resolvePromise(result ?? '')
      })
    })
  }
}
