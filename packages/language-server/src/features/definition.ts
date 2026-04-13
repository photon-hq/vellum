import type { SymbolIndex } from '@vellum-docs/core'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import type { Location } from 'vscode-languageserver/node'
import { resolve } from 'node:path'
import { nodeAtOffset, parseTemplate } from '../template-parser'

export function getDefinition(
  document: TextDocument,
  offset: number,
  index: SymbolIndex,
  configRoot: string | null,
): Location | null {
  const text = document.getText()
  const nodes = parseTemplate(text)
  const node = nodeAtOffset(nodes, offset)

  if (node?.type === 'symbol' && offset >= node.idRange.start && offset <= node.idRange.end) {
    const sym = index.symbol(node.id)
    if (!sym)
      return null

    const filePath = configRoot
      ? resolve(configRoot, sym.source.file)
      : sym.source.file

    return {
      uri: `file://${filePath}`,
      range: {
        start: { line: sym.source.line - 1, character: sym.source.column - 1 },
        end: { line: sym.source.endLine - 1, character: sym.source.endColumn - 1 },
      },
    }
  }

  return null
}
