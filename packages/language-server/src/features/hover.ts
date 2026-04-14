import type { SymbolIndex, Symbol as VSymbol } from '@vellum-docs/core'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import type { Hover } from 'vscode-languageserver/node'
import { nodeAtOffset, parseTemplate, resolveVariableType } from '../template-parser'

const RE_WORD = /(\w+)/

const FILTER_DOCS: Record<string, string> = {
  signature: 'Renders the symbol\'s signature as a fenced code block (routes through the active renderer profile).',
  link: 'Renders the symbol name as a clickable link (routes through the active renderer profile).',
  typeRef: 'Renders an inline type reference with tooltip — profile-dependent.',
  typeCard: 'Renders a full card: signature + docs + examples — profile-dependent.',
  typeString: 'Renders a `TypeString` object as inline code — profile-dependent.',
  declaration: 'Returns the canonical declaration text for a symbol (printer-normalized, JSDoc stripped). Equivalent to `sym.signature`.',
  cell: 'Produce a markdown-table-cell-safe rendering. Accepts a `TypeString`, string, or null. Collapses whitespace, escapes `|`, wraps in a code span — profile-routed.',
  example: 'Returns the nth `@example` code block. Usage: `sym | example(0)`.',
  summary: 'Extracts the doc summary from a Symbol or DocComment.',
  safe: 'Marks the string as HTML-safe (Nunjucks built-in).',
}

function symbolToMarkdown(sym: VSymbol): string {
  const parts: string[] = []
  parts.push(`**${sym.kind}** \`${sym.name}\``)
  parts.push('```ts')
  parts.push(sym.signature)
  parts.push('```')
  if (sym.doc.summary)
    parts.push(sym.doc.summary)
  parts.push(`*${sym.module}:${sym.source.line}*`)
  return parts.join('\n\n')
}

export function getHover(
  document: TextDocument,
  offset: number,
  index: SymbolIndex,
): Hover | null {
  const text = document.getText()
  const nodes = parseTemplate(text)
  const node = nodeAtOffset(nodes, offset)

  // Hover over a symbol("...") string — show the resolved symbol
  if (node?.type === 'symbol' && offset >= node.idRange.start && offset <= node.idRange.end) {
    const sym = index.symbol(node.id)
    if (!sym)
      return null

    return {
      contents: { kind: 'markdown', value: symbolToMarkdown(sym) },
    }
  }

  // Hover over a filter name
  if (node?.type === 'filter') {
    const doc = FILTER_DOCS[node.name]
    if (doc) {
      return {
        contents: { kind: 'markdown', value: `**filter** \`${node.name}\`\n\n${doc}` },
      }
    }
  }

  // Hover over a module("...") path
  if (node?.type === 'module' && offset >= node.pathRange.start && offset <= node.pathRange.end) {
    const mod = index.module(node.path)
    if (!mod)
      return null

    const exportNames = mod.exports.map(s => `\`${s.name}\``).join(', ')
    return {
      contents: {
        kind: 'markdown',
        value: `**module** \`${mod.path}\`\n\n${mod.exports.length} exports: ${exportNames}`,
      },
    }
  }

  // Hover over a variable name — check if it's bound to a symbol
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  const lineText = text.slice(lineStart, offset + 20)
  const wordMatch = lineText.match(RE_WORD)
  if (wordMatch) {
    const wordStart = lineStart + wordMatch.index!
    const word = wordMatch[1]!
    if (offset >= wordStart && offset <= wordStart + word.length) {
      const varType = resolveVariableType(nodes, word, offset)
      if (varType) {
        return {
          contents: {
            kind: 'markdown',
            value: `**variable** \`${word}\` — type: \`${varType}\``,
          },
        }
      }
    }
  }

  return null
}
