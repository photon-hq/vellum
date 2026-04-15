import type { TemplateReads } from './dev/reads'
import type { RendererProfile } from './profile'
import type { SymbolIndex } from './symbol-index'

export interface TemplateContext {
  index: SymbolIndex
  profile: RendererProfile
  sourceFile: string
  /**
   * When present, the engine must populate this with every read made
   * through the `symbol`, `symbols`, and `module` globals during render.
   * Used by watch mode for per-template invalidation.
   */
  reads?: TemplateReads
}

export interface RenderResult {
  output: string
  reads?: TemplateReads
}

export interface TemplateEngine {
  readonly name: string
  readonly sourceExtension: string
  /**
   * Render `source` against the given context. Returns the rendered
   * output; when `ctx.reads` was supplied, the same `TemplateReads`
   * object is returned via `reads` for convenience.
   */
  render: (source: string, ctx: TemplateContext) => Promise<RenderResult>
}
