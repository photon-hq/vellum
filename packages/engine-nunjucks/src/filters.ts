import type { Symbol, TemplateContext, TypeString } from '@vellum-docs/core'

export function buildFilters(ctx: TemplateContext) {
  const resolve = (id: string) => ctx.index.symbol(id)
  const renderCtx = { profile: ctx.profile, resolve }

  return {
    link: (sym: Symbol) => ctx.profile.link(sym, renderCtx),
    signature: (sym: Symbol) => ctx.profile.signature(sym, renderCtx),
    typeRef: (sym: Symbol) => ctx.profile.typeRef(sym, renderCtx),
    typeCard: (sym: Symbol) => ctx.profile.typeCard(sym, renderCtx),
    typeString: (ts: TypeString) => ctx.profile.typeString(ts, renderCtx),

    /**
     * Canonical declaration text for a symbol. Populated by the extractor
     * using the host language's native printer (e.g. `ts.createPrinter` for
     * TypeScript). Equivalent to `{{ sym.signature }}`.
     */
    declaration: (sym: Symbol) => sym.signature,

    /** Return the nth @example code block, or empty string. */
    example: (sym: Symbol, n: number = 0) => {
      const ex = sym.doc.examples[n]
      if (!ex)
        return ''
      return ex.code
    },

    /** Just the summary from a DocComment (or a Symbol). */
    summary: (target: Symbol | { summary: string } | null | undefined) => {
      if (!target)
        return ''
      if ('doc' in target)
        return target.doc.summary
      if ('summary' in target)
        return target.summary
      return ''
    },
  }
}
