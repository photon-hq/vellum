import type { RendererProfile } from './profile'
import type { SymbolIndex } from './symbol-index'

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
