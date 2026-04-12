import type { RendererProfile } from './profile.js'
import type { SymbolIndex } from './symbol-index.js'

export interface TemplateContext {
  index: SymbolIndex
  profile: RendererProfile
  sourceFile: string
}

export interface TemplateEngine {
  readonly name: string
  readonly sourceExtension: string
  render: (source: string, ctx: TemplateContext) => Promise<string>
}
