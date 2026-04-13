/** Offset range within a document. */
export interface Range {
  start: number
  end: number
}

/** A `symbol("...")` call found in the template. */
export interface SymbolCall {
  type: 'symbol'
  /** The full SymbolId string (may be partial if the user is still typing). */
  id: string
  /** Range of the string literal (inside the quotes). */
  idRange: Range
  /** Range of the entire `symbol("...")` expression. */
  range: Range
}

/** A `symbols({...})` call found in the template. */
export interface SymbolsCall {
  type: 'symbols'
  /** Raw text of the object literal argument. */
  queryText: string
  /** Range of the object literal. */
  queryRange: Range
  /** Range of the entire `symbols({...})` expression. */
  range: Range
}

/** A `module("...")` call found in the template. */
export interface ModuleCall {
  type: 'module'
  /** The module path string. */
  path: string
  /** Range of the string literal. */
  pathRange: Range
  /** Range of the entire expression. */
  range: Range
}

/** A `{% set <var> = <expr> %}` binding. */
export interface SetBinding {
  type: 'set'
  name: string
  /** Inferred type: 'symbol', 'symbols', 'module', or 'unknown'. */
  valueType: 'symbol' | 'symbols' | 'module' | 'unknown'
  range: Range
}

/** A `{% for <var> in <expr> %}` loop. */
export interface ForBinding {
  type: 'for'
  name: string
  /** What is being iterated: 'symbols', 'members', 'examples', 'parameters', or 'unknown'. */
  iterableType: string
  range: Range
  /** Offset of the matching `{% endfor %}`, or end of document. */
  scopeEnd: number
}

/** A filter in a pipe chain, e.g. `| mdxSignature`. */
export interface FilterRef {
  type: 'filter'
  name: string
  range: Range
}

export type TemplateNode = SymbolCall | SymbolsCall | ModuleCall | SetBinding | ForBinding | FilterRef

const RE_SYMBOL_CALL = /\bsymbol\(\s*(["'])([^"']*)\1\s*\)/g
const RE_SYMBOLS_CALL = /\bsymbols\(\s*\{/g
const RE_MODULE_CALL = /\bmodule\(\s*(["'])([^"']*)\1\s*\)/g
const RE_SET = /\{%-?\s*set\s+(\w+)\s*=\s*(symbol|symbols|module)\s*\(/g
const RE_FOR = /\{%-?\s*for\s+(\w+)\s+in\s+(\w+)(?:\.(\w+))?/g
const RE_ENDFOR = /\{%-?\s*endfor\s*-?%\}/g
const RE_FILTER = /\|\s*(\w+)/g

/** Find the matching closing brace for an opening `{` at `start`. */
function findClosingBrace(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') {
      depth++
    }
    else if (text[i] === '}') {
      depth--
      if (depth === 0)
        return i
    }
  }
  return text.length
}

/** Parse a template document and return all recognized nodes. */
export function parseTemplate(text: string): TemplateNode[] {
  const nodes: TemplateNode[] = []

  // symbol("...") calls
  for (const m of text.matchAll(RE_SYMBOL_CALL)) {
    const fullStart = m.index
    const id = m[2]!
    const quoteChar = m[1]!
    // Find the string literal range (inside quotes)
    const idStart = fullStart + m[0].indexOf(quoteChar) + 1
    nodes.push({
      type: 'symbol',
      id,
      idRange: { start: idStart, end: idStart + id.length },
      range: { start: fullStart, end: fullStart + m[0].length },
    })
  }

  // symbols({...}) calls
  for (const m of text.matchAll(RE_SYMBOLS_CALL)) {
    const fullStart = m.index
    const braceStart = fullStart + m[0].length - 1 // position of `{`
    const braceEnd = findClosingBrace(text, braceStart)
    const closeParenEnd = text.indexOf(')', braceEnd)
    const end = closeParenEnd === -1 ? braceEnd + 1 : closeParenEnd + 1
    const queryText = text.slice(braceStart, braceEnd + 1)
    nodes.push({
      type: 'symbols',
      queryText,
      queryRange: { start: braceStart, end: braceEnd + 1 },
      range: { start: fullStart, end },
    })
  }

  // module("...") calls
  for (const m of text.matchAll(RE_MODULE_CALL)) {
    const fullStart = m.index
    const path = m[2]!
    const quoteChar = m[1]!
    const pathStart = fullStart + m[0].indexOf(quoteChar) + 1
    nodes.push({
      type: 'module',
      path,
      pathRange: { start: pathStart, end: pathStart + path.length },
      range: { start: fullStart, end: fullStart + m[0].length },
    })
  }

  // {% set var = symbol/symbols/module(...) %}
  for (const m of text.matchAll(RE_SET)) {
    nodes.push({
      type: 'set',
      name: m[1]!,
      valueType: m[2] as 'symbol' | 'symbols' | 'module',
      range: { start: m.index, end: m.index + m[0].length },
    })
  }

  // {% for var in expr %} ... {% endfor %}
  const endforPositions: number[] = []
  for (const m of text.matchAll(RE_ENDFOR)) {
    endforPositions.push(m.index + m[0].length)
  }

  let endforIdx = 0
  for (const m of text.matchAll(RE_FOR)) {
    const iterVar = m[1]!
    const sourceVar = m[2]!
    const sourceProperty = m[3] // e.g. "members" in "t.members"

    let iterableType = 'unknown'
    if (sourceProperty === 'members')
      iterableType = 'members'
    else if (sourceProperty === 'examples' || sourceProperty === 'doc')
      iterableType = 'examples'
    else if (sourceProperty === 'parameters')
      iterableType = 'parameters'
    else if (sourceVar === 'symbols' || !sourceProperty)
      iterableType = 'symbols'

    // Find the matching endfor
    while (endforIdx < endforPositions.length && endforPositions[endforIdx]! <= m.index) {
      endforIdx++
    }
    const scopeEnd = endforIdx < endforPositions.length ? endforPositions[endforIdx]! : text.length

    nodes.push({
      type: 'for',
      name: iterVar,
      iterableType,
      range: { start: m.index, end: m.index + m[0].length },
      scopeEnd,
    })
  }

  // Filter references: | filterName
  for (const m of text.matchAll(RE_FILTER)) {
    nodes.push({
      type: 'filter',
      name: m[1]!,
      range: { start: m.index, end: m.index + m[0].length },
    })
  }

  return nodes
}

/**
 * Determine what type a variable has at a given offset, based on set/for bindings.
 * Returns 'symbol', 'member', 'parameter', 'example', 'module', or null.
 */
export function resolveVariableType(
  nodes: TemplateNode[],
  varName: string,
  offset: number,
): string | null {
  // Check for bindings in reverse order (latest binding wins)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!
    if (node.range.start > offset)
      continue

    if (node.type === 'set' && node.name === varName) {
      return node.valueType // 'symbol', 'symbols', 'module'
    }

    if (node.type === 'for' && node.name === varName && offset <= node.scopeEnd) {
      if (node.iterableType === 'symbols')
        return 'symbol'
      if (node.iterableType === 'members')
        return 'member'
      if (node.iterableType === 'parameters')
        return 'parameter'
      if (node.iterableType === 'examples')
        return 'example'
      return 'symbol' // default for unknown iterables
    }
  }
  return null
}

/**
 * Find which node (if any) contains the given offset.
 */
export function nodeAtOffset(nodes: TemplateNode[], offset: number): TemplateNode | null {
  for (const node of nodes) {
    if (offset >= node.range.start && offset <= node.range.end) {
      return node
    }
    // Also check inner ranges
    if (node.type === 'symbol' && offset >= node.idRange.start && offset <= node.idRange.end) {
      return node
    }
    if (node.type === 'symbols' && offset >= node.queryRange.start && offset <= node.queryRange.end) {
      return node
    }
    if (node.type === 'module' && offset >= node.pathRange.start && offset <= node.pathRange.end) {
      return node
    }
  }
  return null
}
