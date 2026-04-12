import type {
  RenderContext,
  RendererProfile,
  Symbol,
  TypeString,
} from '@vellum-docs/core'

const RE_TRAILING_WHITESPACE = /\s*$/

function codeFence(lang: string, body: string): string {
  return `\`\`\`${lang}\n${body.replace(RE_TRAILING_WHITESPACE, '')}\n\`\`\``
}

export class MarkdownProfile implements RendererProfile {
  readonly name = 'markdown'
  readonly targetExtensions = ['.md', '.mdx'] as const

  typeRef(sym: Symbol, _ctx: RenderContext): string {
    // Plain markdown has no hover — just render the name as inline code.
    return `\`${sym.name}\``
  }

  signature(sym: Symbol, _ctx: RenderContext): string {
    return codeFence('ts', sym.signature)
  }

  typeString(ts: TypeString, _ctx: RenderContext): string {
    return `\`${ts.text}\``
  }

  typeCard(sym: Symbol, ctx: RenderContext): string {
    const parts: string[] = []
    parts.push(`### ${sym.name}`)
    if (sym.doc.summary)
      parts.push(sym.doc.summary)
    parts.push(this.signature(sym, ctx))
    if (sym.doc.description)
      parts.push(sym.doc.description)
    for (const ex of sym.doc.examples) {
      parts.push(codeFence(ex.lang || 'ts', ex.code))
    }
    return parts.join('\n\n')
  }

  link(sym: Symbol, _ctx: RenderContext): string {
    return `\`${sym.name}\``
  }
}
