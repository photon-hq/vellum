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
   * Shared Nunjucks environment — built once in the constructor so that
   * N template renders don't recreate N loaders + N environments.
   * Context-dependent globals/filters are updated in-place before each
   * render (addGlobal/addFilter replaces by key, so this is safe).
   */
  private readonly env: nunjucks.Environment

  constructor(opts: NunjucksEngineOptions = {}) {
    this.sourceExtension = opts.sourceExtension ?? '.vel'

    const searchPaths = [builtinPartialsDir, ...(opts.searchPaths ?? [])]
    this.env = new nunjucks.Environment(
      new nunjucks.FileSystemLoader(searchPaths, {
        noCache: true,
        watch: false,
      }),
      {
        autoescape: opts.autoescape ?? false,
        throwOnUndefined: false,
        trimBlocks: false,
        lstripBlocks: false,
      },
    )

    // Path alias: `{% include "@vellum-docs/partials/..." %}` → built-in partials dir.
    type GetTemplateFn = (name: string, ...rest: unknown[]) => unknown
    const originalGetTemplate = (this.env as unknown as { getTemplate: GetTemplateFn }).getTemplate.bind(this.env);
    (this.env as unknown as { getTemplate: GetTemplateFn }).getTemplate = function (
      name: string,
      ...rest: unknown[]
    ) {
      const resolved = name.startsWith('@vellum-docs/partials/')
        ? name.slice('@vellum-docs/partials/'.length)
        : name
      return originalGetTemplate(resolved, ...rest)
    }

    // Register static extra globals and filters once.
    const extraGlobals = opts.globals ?? {}
    const extraFilters = opts.filters ?? {}
    for (const [k, v] of Object.entries(extraGlobals)) this.env.addGlobal(k, v as never)
    for (const [k, v] of Object.entries(extraFilters)) this.env.addFilter(k, v)
  }

  async render(source: string, ctx: TemplateContext): Promise<string> {
    // Update context-specific globals and filters for this render call.
    const globals = buildGlobals(ctx)
    for (const [k, v] of Object.entries(globals)) this.env.addGlobal(k, v as never)

    const filters = buildFilters(ctx)
    for (const [k, v] of Object.entries(filters)) this.env.addFilter(k, v)

    return new Promise<string>((resolvePromise, reject) => {
      this.env.renderString(source, {}, (err, result) => {
        if (err)
          reject(err)
        else resolvePromise(result ?? '')
      })
    })
  }
}
