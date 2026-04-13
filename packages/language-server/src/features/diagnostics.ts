import type { SymbolIndex } from '@vellum-docs/core'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import type { Connection, Diagnostic } from 'vscode-languageserver/node'
import { DiagnosticSeverity } from 'vscode-languageserver/node'
import { parseTemplate } from '../template-parser'

const VALID_KINDS = new Set([
  'function',
  'method',
  'constructor',
  'class',
  'interface',
  'type',
  'enum',
  'namespace',
  'module',
  'const',
  'variable',
  'property',
  'parameter',
  'typeParameter',
  'unknown',
])

const RE_KIND_VALUE = /kind:\s*["'](\w+)["']/g

function offsetToPosition(text: string, offset: number) {
  let line = 0
  let char = 0
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      char = 0
    }
    else {
      char++
    }
  }
  return { line, character: char }
}

export function computeDiagnostics(document: TextDocument, index: SymbolIndex): Diagnostic[] {
  const text = document.getText()
  const nodes = parseTemplate(text)
  const diagnostics: Diagnostic[] = []

  for (const node of nodes) {
    if (node.type === 'symbol') {
      // Validate the SymbolId resolves
      if (node.id && !index.symbol(node.id)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: offsetToPosition(text, node.idRange.start),
            end: offsetToPosition(text, node.idRange.end),
          },
          message: `Symbol "${node.id}" not found in the index`,
          source: 'vellum',
        })
      }
    }

    if (node.type === 'module') {
      if (node.path && !index.module(node.path)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: offsetToPosition(text, node.pathRange.start),
            end: offsetToPosition(text, node.pathRange.end),
          },
          message: `Module "${node.path}" not found in the index`,
          source: 'vellum',
        })
      }
    }

    if (node.type === 'symbols') {
      // Validate kind values
      for (const m of node.queryText.matchAll(RE_KIND_VALUE)) {
        const kind = m[1]!
        if (!VALID_KINDS.has(kind)) {
          const kindOffset = node.queryRange.start + m.index + m[0].indexOf(kind)
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: offsetToPosition(text, kindOffset),
              end: offsetToPosition(text, kindOffset + kind.length),
            },
            message: `Invalid symbol kind "${kind}"`,
            source: 'vellum',
          })
        }
      }
    }
  }

  return diagnostics
}

export function publishDiagnostics(
  connection: Connection,
  document: TextDocument,
  index: SymbolIndex,
): void {
  const diagnostics = computeDiagnostics(document, index)
  connection.sendDiagnostics({ uri: document.uri, diagnostics })
}
