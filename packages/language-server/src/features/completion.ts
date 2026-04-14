import type { SymbolIndex } from '@vellum-docs/core'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import type { CompletionItem } from 'vscode-languageserver/node'
import { CompletionItemKind } from 'vscode-languageserver/node'
import { nodeAtOffset, parseTemplate, resolveVariableType } from '../template-parser'

const RE_KIND_VALUE_POS = /kind:\s*["'][^"']*$/
const RE_MODULE_VALUE_POS = /module:\s*["'][^"']*$/
const RE_FILTER_POS = /\|\s*\w*$/
const RE_DOT_ACCESS = /(\w+)((?:\.\w+)*)\.\s*(\w*)$/

const SYMBOL_QUERY_KEYS = ['module', 'kind', 'language', 'tag', 'customTag', 'prefix', 'exportedOnly']

const SYMBOL_KINDS = [
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
]

const FILTER_NAMES = [
  { name: 'signature', detail: 'Signature as a code fence (profile-specific)' },
  { name: 'link', detail: 'Name as a link (profile-specific)' },
  { name: 'typeRef', detail: 'Render inline type reference with tooltip' },
  { name: 'typeCard', detail: 'Render full card: signature + docs + examples' },
  { name: 'typeString', detail: 'Render a TypeString inline' },
  { name: 'declaration', detail: 'Canonical declaration text (alias for .signature)' },
  { name: 'cell', detail: 'Cell-safe rendering for markdown table cells' },
  { name: 'example', detail: 'Get nth @example code block' },
  { name: 'summary', detail: 'Get doc summary text' },
  { name: 'safe', detail: 'Mark as HTML-safe (Nunjucks built-in)' },
]

const SYMBOL_PROPERTIES: { name: string, detail: string }[] = [
  { name: 'id', detail: 'SymbolId' },
  { name: 'name', detail: 'string' },
  { name: 'kind', detail: 'SymbolKind' },
  { name: 'language', detail: 'string' },
  { name: 'module', detail: 'string' },
  { name: 'source', detail: 'SourceLocation' },
  { name: 'visibility', detail: 'string' },
  { name: 'exported', detail: 'boolean' },
  { name: 'signature', detail: 'string' },
  { name: 'doc', detail: 'DocComment' },
  { name: 'tags', detail: 'string[]' },
  { name: 'parameters', detail: 'Parameter[]' },
  { name: 'returnType', detail: 'TypeString' },
  { name: 'members', detail: 'Member[]' },
  { name: 'typeParameters', detail: 'TypeParameter[]' },
  { name: 'variants', detail: 'EnumVariant[]' },
  { name: 'value', detail: 'Literal | null' },
  { name: 'valueType', detail: 'TypeString' },
  { name: 'aliasOf', detail: 'TypeString' },
  { name: 'extends', detail: 'TypeString[]' },
  { name: 'implements', detail: 'TypeString[]' },
  { name: 'mutable', detail: 'boolean' },
  { name: 'discriminator', detail: 'string (tagged-union discriminator property name)' },
]

const DOC_PROPERTIES: { name: string, detail: string }[] = [
  { name: 'summary', detail: 'string' },
  { name: 'description', detail: 'string' },
  { name: 'params', detail: 'Record<string, string>' },
  { name: 'returns', detail: 'string | null' },
  { name: 'examples', detail: 'Example[]' },
  { name: 'throws', detail: '{ type, description }[]' },
  { name: 'see', detail: 'string[]' },
  { name: 'deprecated', detail: '{ reason } | null' },
  { name: 'since', detail: 'string | null' },
  { name: 'customTags', detail: 'Record<string, string[]>' },
  { name: 'raw', detail: 'string' },
]

const MEMBER_PROPERTIES: { name: string, detail: string }[] = [
  { name: 'name', detail: 'string' },
  { name: 'kind', detail: 'string' },
  { name: 'signature', detail: 'string' },
  { name: 'type', detail: 'TypeString' },
  { name: 'optional', detail: 'boolean' },
  { name: 'readonly', detail: 'boolean' },
  { name: 'visibility', detail: 'string' },
  { name: 'static', detail: 'boolean' },
  { name: 'doc', detail: 'DocComment' },
]

const PARAMETER_PROPERTIES: { name: string, detail: string }[] = [
  { name: 'name', detail: 'string' },
  { name: 'type', detail: 'TypeString' },
  { name: 'optional', detail: 'boolean' },
  { name: 'rest', detail: 'boolean' },
  { name: 'defaultValue', detail: 'Literal | null' },
  { name: 'doc', detail: 'string' },
]

const EXAMPLE_PROPERTIES: { name: string, detail: string }[] = [
  { name: 'title', detail: 'string | null' },
  { name: 'lang', detail: 'string' },
  { name: 'code', detail: 'string' },
  { name: 'description', detail: 'string | null' },
]

function getPropertyCompletions(varType: string, chain: string): CompletionItem[] {
  let props: { name: string, detail: string }[] = []

  if (chain === '' || chain === '.') {
    if (varType === 'symbol')
      props = SYMBOL_PROPERTIES
    else if (varType === 'member')
      props = MEMBER_PROPERTIES
    else if (varType === 'parameter')
      props = PARAMETER_PROPERTIES
    else if (varType === 'example')
      props = EXAMPLE_PROPERTIES
  }
  else if (chain === '.doc.' || chain === 'doc.') {
    props = DOC_PROPERTIES
  }
  else if (chain === '.returnType.' || chain === '.type.' || chain === '.valueType.' || chain === '.aliasOf.') {
    props = [
      { name: 'text', detail: 'string' },
      { name: 'oneline', detail: 'string | undefined (single-line form)' },
      { name: 'refs', detail: 'TypeRef[]' },
    ]
  }
  else if (chain === '.value.') {
    props = [
      { name: 'text', detail: 'string' },
      { name: 'kind', detail: 'string' },
      { name: 'value', detail: 'string | number | boolean' },
    ]
  }
  else if (chain === '.source.') {
    props = [
      { name: 'file', detail: 'string' },
      { name: 'line', detail: 'number' },
      { name: 'column', detail: 'number' },
      { name: 'endLine', detail: 'number' },
      { name: 'endColumn', detail: 'number' },
    ]
  }

  return props.map(p => ({
    label: p.name,
    kind: CompletionItemKind.Property,
    detail: p.detail,
  }))
}

export function getCompletions(
  document: TextDocument,
  offset: number,
  index: SymbolIndex,
): CompletionItem[] {
  const text = document.getText()
  const nodes = parseTemplate(text)
  const node = nodeAtOffset(nodes, offset)

  // Context 1: Inside symbol("...")
  if (node?.type === 'symbol' && offset >= node.idRange.start && offset <= node.idRange.end) {
    const partial = text.slice(node.idRange.start, offset)
    const hashIdx = partial.indexOf('#')

    if (hashIdx === -1) {
      // Complete module paths, prefixed with language
      const modules = new Set<string>()
      for (const sym of index.all()) {
        modules.add(`${sym.language}:${sym.module}`)
      }
      return Array.from(modules).sort().map(m => ({
        label: `${m}#`,
        kind: CompletionItemKind.Module,
        insertText: `${m}#`,
      }))
    }

    // After '#' - complete symbol names within the module
    const modulePrefix = partial.slice(0, hashIdx)
    const langSep = modulePrefix.indexOf(':')
    const modulePath = langSep === -1 ? modulePrefix : modulePrefix.slice(langSep + 1)

    const symbols = index.symbols({ module: modulePath, exportedOnly: true })
    return symbols.map(s => ({
      label: s.name,
      kind: CompletionItemKind.Reference,
      detail: `${s.kind} - ${s.doc.summary || s.signature}`,
    }))
  }

  // Context 2: Inside symbols({...})
  if (node?.type === 'symbols' && offset >= node.queryRange.start && offset <= node.queryRange.end) {
    const textBefore = text.slice(node.queryRange.start, offset)

    // Check if we're in a kind value position
    if (RE_KIND_VALUE_POS.test(textBefore)) {
      return SYMBOL_KINDS.map(k => ({
        label: k,
        kind: CompletionItemKind.EnumMember,
      }))
    }

    // Check if we're in a module value position
    if (RE_MODULE_VALUE_POS.test(textBefore)) {
      const modules = new Set<string>()
      for (const sym of index.all()) modules.add(sym.module)
      return Array.from(modules).sort().map(m => ({
        label: m,
        kind: CompletionItemKind.Module,
      }))
    }

    // Default: offer query keys
    return SYMBOL_QUERY_KEYS.map(k => ({
      label: k,
      kind: CompletionItemKind.Property,
    }))
  }

  // Context 3: Inside module("...")
  if (node?.type === 'module' && offset >= node.pathRange.start && offset <= node.pathRange.end) {
    const modules = new Set<string>()
    for (const sym of index.all()) modules.add(sym.module)
    return Array.from(modules).sort().map(m => ({
      label: m,
      kind: CompletionItemKind.Module,
    }))
  }

  // Context 4: Filter completions - check if cursor is after a `|`
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  const lineText = text.slice(lineStart, offset)
  if (RE_FILTER_POS.test(lineText)) {
    return FILTER_NAMES.map(f => ({
      label: f.name,
      kind: CompletionItemKind.Function,
      detail: f.detail,
    }))
  }

  // Context 5: Property completions - check if cursor is after a `.` on a variable
  const dotMatch = lineText.match(RE_DOT_ACCESS)
  if (dotMatch) {
    const varName = dotMatch[1]!
    const chain = `${dotMatch[2]!}.`
    const varType = resolveVariableType(nodes, varName, offset)
    if (varType) {
      return getPropertyCompletions(varType, chain)
    }
  }

  return []
}
