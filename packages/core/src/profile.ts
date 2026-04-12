import type { Symbol, TypeString } from "./types.js";

export interface RenderContext {
  profile: RendererProfile;
  resolve: (symbolId: string) => Symbol | null;
}

export interface RendererProfile {
  readonly name: string;
  readonly targetExtensions: readonly string[];

  /** Inline reference to a type — name with a hover tooltip when supported. */
  typeRef(sym: Symbol, ctx: RenderContext): string;

  /** A signature rendered as a code fence, with typeRefs linkified if possible. */
  signature(sym: Symbol, ctx: RenderContext): string;

  /** A type-string rendered inline, with linkified refs. */
  typeString(ts: TypeString, ctx: RenderContext): string;

  /** A full "card" for a type: signature + description + examples. */
  typeCard(sym: Symbol, ctx: RenderContext): string;

  /** A link to the docs page for a symbol, by name. */
  link(sym: Symbol, ctx: RenderContext): string;

  /** Post-processing applied to the final template output (optional). */
  postProcess?(output: string): string;
}
