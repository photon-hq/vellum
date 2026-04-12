import type { Symbol, TemplateContext, TypeString } from "@vellum-docs/core";

export const buildFilters = (ctx: TemplateContext) => {
  const resolve = (id: string) => ctx.index.symbol(id);
  const renderCtx = { profile: ctx.profile, resolve };

  return {
    mdxLink: (sym: Symbol) => ctx.profile.link(sym, renderCtx),
    mdxSignature: (sym: Symbol) => ctx.profile.signature(sym, renderCtx),
    typeRef: (sym: Symbol) => ctx.profile.typeRef(sym, renderCtx),
    typeCard: (sym: Symbol) => ctx.profile.typeCard(sym, renderCtx),
    typeString: (ts: TypeString) => ctx.profile.typeString(ts, renderCtx),

    /** Return the nth @example code block, or empty string. */
    example: (sym: Symbol, n: number = 0) => {
      const ex = sym.doc.examples[n];
      if (!ex) return "";
      return ex.code;
    },

    /** Just the summary from a DocComment (or a Symbol). */
    summary: (target: Symbol | { summary: string } | null | undefined) => {
      if (!target) return "";
      if ("doc" in target) return target.doc.summary;
      if ("summary" in target) return target.summary;
      return "";
    },
  };
};
