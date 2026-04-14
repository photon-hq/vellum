import type {
  RenderContext,
  RendererProfile,
  Symbol,
  TypeString,
} from '@vellum-docs/core'

const RE_TRAILING_WHITESPACE = /\s*$/
const RE_BACKSLASH = /\\/g
const RE_DOUBLE_QUOTE = /"/g
const RE_NEWLINES = /\n+/g
const RE_WHITESPACE_RUNS = /\s+/g
const RE_PIPE = /\|/g

function codeFence(lang: string, body: string): string {
  return `\`\`\`${lang}\n${body.replace(RE_TRAILING_WHITESPACE, '')}\n\`\`\``
}

/** Escape a string for use inside a Mintlify `<Tooltip tip="...">` prop. */
function escapeTipString(s: string): string {
  return s.replace(RE_BACKSLASH, '\\\\').replace(RE_DOUBLE_QUOTE, '\\"').replace(RE_NEWLINES, ' ')
}

/** One-line summary of a declaration, used for tooltip hover strings. */
function shortSummary(sym: Symbol): string {
  const sig = sym.signature.replace(RE_WHITESPACE_RUNS, ' ').trim()
  const max = 200
  return sig.length > max ? `${sig.slice(0, max - 1)}…` : sig
}

export class MintlifyProfile implements RendererProfile {
  readonly name = 'mintlify'
  readonly targetExtensions = ['.mdx'] as const

  typeRef(sym: Symbol, _ctx: RenderContext): string {
    const tip = escapeTipString(shortSummary(sym))
    return `<Tooltip tip="${tip}">\`${sym.name}\`</Tooltip>`
  }

  signature(sym: Symbol, _ctx: RenderContext): string {
    return codeFence('ts', sym.signature)
  }

  typeString(ts: TypeString, _ctx: RenderContext): string {
    return `\`${ts.text}\``
  }

  typeCard(sym: Symbol, ctx: RenderContext): string {
    const parts: string[] = []
    parts.push(`<Card title="${sym.name}">`)
    if (sym.doc.summary)
      parts.push(sym.doc.summary)
    parts.push(this.signature(sym, ctx))
    if (sym.doc.description)
      parts.push(sym.doc.description)
    if (sym.doc.examples.length > 0) {
      parts.push('<CodeGroup>')
      for (const ex of sym.doc.examples) {
        parts.push(codeFence(ex.lang || 'ts', ex.code))
      }
      parts.push('</CodeGroup>')
    }
    parts.push('</Card>')
    return parts.join('\n\n')
  }

  link(sym: Symbol, _ctx: RenderContext): string {
    return `\`${sym.name}\``
  }

  cell(value: string, _ctx: RenderContext): string {
    // Wrapping in a code span makes `<>` literal under MDX; the only
    // cell-specific escape left is the column separator.
    return `\`${value.replace(RE_PIPE, '\\|')}\``
  }
}
