import type {
  DocComment,
  EnumVariant,
  Literal,
  Member,
  Parameter,
  TypeRef,
  TypeString,
  Symbol as VSymbol,
} from '@vellum-docs/core'

import { emptyDocComment } from '@vellum-docs/core'
import ts from 'typescript'

import { parseTSDoc } from './tsdoc'
import {
  formatSignature,
  getLeadingJSDoc,
  isExported,
  locationOf,
  makeId,
  moduleOf,
} from './util'

// Module-level regex constants (eslint: e18e/prefer-static-regex)
const RE_STRING_LITERAL = /^".*"$|^'.*'$|^`.*`$/
const RE_NUMBER_LITERAL = /^-?\d+(?:\.\d+)?$/
const RE_TRAILING_SEMI = /;$/
const RE_LEADING_AT = /^@/

interface WalkContext {
  checker: ts.TypeChecker
  sourceFile: ts.SourceFile
  modulePath: string
  root: string
  /** Map of qualified name → id, populated in a first pass for cross-ref resolution. */
  knownNames: Map<string, string>
  /** When true, all symbols are treated as exported (package extraction mode). */
  forceExported?: boolean
}

function isSymExported(node: ts.Node, ctx: WalkContext): boolean {
  return ctx.forceExported || isExported(node)
}

function docOrEmpty(node: ts.Node, sourceFile: ts.SourceFile): DocComment {
  const raw = getLeadingJSDoc(node, sourceFile)
  return raw ? parseTSDoc(raw) : emptyDocComment()
}

function literalFromText(text: string): Literal {
  const trimmed = text.trim()
  if (RE_STRING_LITERAL.test(trimmed)) {
    return { kind: 'string', text: trimmed, value: trimmed.slice(1, -1) }
  }
  if (RE_NUMBER_LITERAL.test(trimmed)) {
    return { kind: 'number', text: trimmed, value: Number(trimmed) }
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return { kind: 'boolean', text: trimmed, value: trimmed === 'true' }
  }
  if (trimmed === 'null')
    return { kind: 'null', text: trimmed }
  if (trimmed === 'undefined')
    return { kind: 'undefined', text: trimmed }
  if (trimmed.startsWith('{'))
    return { kind: 'object', text: trimmed }
  if (trimmed.startsWith('['))
    return { kind: 'array', text: trimmed }
  return { kind: 'expression', text: trimmed }
}

/**
 * Build a TypeString from a type node, collecting identifier positions
 * whose symbols are declared in files we're extracting.
 */
function typeStringFrom(typeNode: ts.TypeNode | undefined, ctx: WalkContext): TypeString {
  if (!typeNode)
    return { text: '', refs: [] }
  const text = typeNode.getText(ctx.sourceFile)
  const refs: TypeRef[] = []
  const baseOffset = typeNode.getStart(ctx.sourceFile)

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const name = node.text
      const refId = ctx.knownNames.get(name)
      if (refId) {
        const start = node.getStart(ctx.sourceFile) - baseOffset
        const end = node.getEnd() - baseOffset
        refs.push({ start, end, symbolId: refId })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(typeNode)

  return { text, refs }
}

function extractParameter(param: ts.ParameterDeclaration, ctx: WalkContext, paramDocs: Record<string, string>): Parameter {
  return {
    name: param.name.getText(ctx.sourceFile),
    type: typeStringFrom(param.type, ctx),
    optional: !!param.questionToken || !!param.initializer,
    rest: !!param.dotDotDotToken,
    defaultValue: param.initializer
      ? literalFromText(param.initializer.getText(ctx.sourceFile))
      : null,
    doc: paramDocs[param.name.getText(ctx.sourceFile)] ?? '',
  }
}

function extractFunction(node: ts.FunctionDeclaration, ctx: WalkContext): VSymbol | null {
  if (!node.name)
    return null
  const name = node.name.text
  const doc = docOrEmpty(node, ctx.sourceFile)

  return {
    id: makeId(ctx.modulePath, name),
    name,
    kind: 'function',
    language: 'ts',
    module: ctx.modulePath,
    source: locationOf(node, ctx.sourceFile, ctx.root),
    visibility: 'public',
    exported: isSymExported(node, ctx),
    signature: formatSignature(node, ctx.sourceFile),
    typeRefs: [],
    doc,
    tags: Object.keys(doc.customTags).map(t => t.replace(RE_LEADING_AT, '')),
    parameters: node.parameters.map(p => extractParameter(p, ctx, doc.params)),
    returnType: typeStringFrom(node.type, ctx),
    typeParameters: (node.typeParameters ?? []).map(tp => ({
      name: tp.name.text,
      constraint: tp.constraint ? typeStringFrom(tp.constraint, ctx) : null,
      default: tp.default ? typeStringFrom(tp.default, ctx) : null,
    })),
  }
}

function extractInterfaceMembers(node: ts.InterfaceDeclaration, ctx: WalkContext): Member[] {
  return node.members.map((m): Member => {
    const name = m.name && ts.isIdentifier(m.name) ? m.name.text : m.name?.getText(ctx.sourceFile) ?? ''
    const doc = docOrEmpty(m, ctx.sourceFile)

    if (ts.isMethodSignature(m)) {
      return {
        name,
        kind: 'method',
        signature: m.getText(ctx.sourceFile).replace(RE_TRAILING_SEMI, ''),
        type: { text: m.type?.getText(ctx.sourceFile) ?? '', refs: [] },
        optional: !!m.questionToken,
        readonly: false,
        visibility: 'public',
        static: false,
        doc,
      }
    }
    if (ts.isPropertySignature(m)) {
      return {
        name,
        kind: 'property',
        signature: m.getText(ctx.sourceFile).replace(RE_TRAILING_SEMI, ''),
        type: typeStringFrom(m.type, ctx),
        optional: !!m.questionToken,
        readonly: !!(ts.getModifiers(m)?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword)),
        visibility: 'public',
        static: false,
        doc,
      }
    }
    return {
      name,
      kind: 'property',
      signature: m.getText(ctx.sourceFile).replace(RE_TRAILING_SEMI, ''),
      type: { text: '', refs: [] },
      optional: false,
      readonly: false,
      visibility: 'public',
      static: false,
      doc,
    }
  })
}

function extractInterface(node: ts.InterfaceDeclaration, ctx: WalkContext): VSymbol {
  const name = node.name.text
  const doc = docOrEmpty(node, ctx.sourceFile)
  return {
    id: makeId(ctx.modulePath, name),
    name,
    kind: 'interface',
    language: 'ts',
    module: ctx.modulePath,
    source: locationOf(node, ctx.sourceFile, ctx.root),
    visibility: 'public',
    exported: isSymExported(node, ctx),
    signature: formatSignature(node, ctx.sourceFile),
    typeRefs: [],
    doc,
    tags: Object.keys(doc.customTags).map(t => t.replace(RE_LEADING_AT, '')),
    members: extractInterfaceMembers(node, ctx),
    typeParameters: (node.typeParameters ?? []).map(tp => ({
      name: tp.name.text,
      constraint: tp.constraint ? typeStringFrom(tp.constraint, ctx) : null,
      default: tp.default ? typeStringFrom(tp.default, ctx) : null,
    })),
  }
}

function extractTypeAlias(node: ts.TypeAliasDeclaration, ctx: WalkContext): VSymbol {
  const name = node.name.text
  const doc = docOrEmpty(node, ctx.sourceFile)
  return {
    id: makeId(ctx.modulePath, name),
    name,
    kind: 'type',
    language: 'ts',
    module: ctx.modulePath,
    source: locationOf(node, ctx.sourceFile, ctx.root),
    visibility: 'public',
    exported: isSymExported(node, ctx),
    signature: formatSignature(node, ctx.sourceFile),
    typeRefs: [],
    doc,
    tags: Object.keys(doc.customTags).map(t => t.replace(RE_LEADING_AT, '')),
    aliasOf: typeStringFrom(node.type, ctx),
    typeParameters: (node.typeParameters ?? []).map(tp => ({
      name: tp.name.text,
      constraint: tp.constraint ? typeStringFrom(tp.constraint, ctx) : null,
      default: tp.default ? typeStringFrom(tp.default, ctx) : null,
    })),
  }
}

function extractVariable(statement: ts.VariableStatement, decl: ts.VariableDeclaration, ctx: WalkContext): VSymbol | null {
  if (!ts.isIdentifier(decl.name))
    return null
  const name = decl.name.text
  const isConst
    = (statement.declarationList.flags & ts.NodeFlags.Const) === ts.NodeFlags.Const
  const doc = docOrEmpty(statement, ctx.sourceFile)

  const initText = decl.initializer?.getText(ctx.sourceFile)
  const value = initText ? literalFromText(initText) : null

  // If no annotation, try to ask the checker for the inferred type.
  let valueType: TypeString
  if (decl.type) {
    valueType = typeStringFrom(decl.type, ctx)
  }
  else {
    try {
      const t = ctx.checker.getTypeAtLocation(decl)
      valueType = {
        text: ctx.checker.typeToString(t, decl, ts.TypeFormatFlags.NoTruncation),
        refs: [],
      }
    }
    catch {
      valueType = { text: '', refs: [] }
    }
  }

  return {
    id: makeId(ctx.modulePath, name),
    name,
    kind: isConst ? 'const' : 'variable',
    language: 'ts',
    module: ctx.modulePath,
    source: locationOf(decl, ctx.sourceFile, ctx.root),
    visibility: 'public',
    exported: isSymExported(statement, ctx),
    signature: `${isConst ? 'const' : 'let'} ${name}${valueType.text ? `: ${valueType.text}` : ''}${
      value ? ` = ${value.text}` : ''
    }`,
    typeRefs: [],
    doc,
    tags: Object.keys(doc.customTags).map(t => t.replace(RE_LEADING_AT, '')),
    mutable: !isConst,
    valueType,
    value,
  }
}

function extractEnum(node: ts.EnumDeclaration, ctx: WalkContext): VSymbol {
  const name = node.name.text
  const doc = docOrEmpty(node, ctx.sourceFile)
  const variants: EnumVariant[] = node.members.map(m => ({
    name: m.name.getText(ctx.sourceFile),
    value: m.initializer ? literalFromText(m.initializer.getText(ctx.sourceFile)) : null,
    doc: docOrEmpty(m, ctx.sourceFile),
  }))
  return {
    id: makeId(ctx.modulePath, name),
    name,
    kind: 'enum',
    language: 'ts',
    module: ctx.modulePath,
    source: locationOf(node, ctx.sourceFile, ctx.root),
    visibility: 'public',
    exported: isSymExported(node, ctx),
    signature: formatSignature(node, ctx.sourceFile),
    typeRefs: [],
    doc,
    tags: Object.keys(doc.customTags).map(t => t.replace(RE_LEADING_AT, '')),
    variants,
  }
}

function extractClass(node: ts.ClassDeclaration, ctx: WalkContext): VSymbol | null {
  if (!node.name)
    return null
  const name = node.name.text
  const doc = docOrEmpty(node, ctx.sourceFile)

  const members: Member[] = node.members
    .map((m): Member | null => {
      const memberName
        = m.name && ts.isIdentifier(m.name)
          ? m.name.text
          : m.name?.getText(ctx.sourceFile) ?? ''
      const memberDoc = docOrEmpty(m, ctx.sourceFile)
      const mods = ts.canHaveModifiers(m) ? ts.getModifiers(m) : undefined
      const visibility
        = mods?.some(mod => mod.kind === ts.SyntaxKind.PrivateKeyword)
          ? 'private'
          : mods?.some(mod => mod.kind === ts.SyntaxKind.ProtectedKeyword)
            ? 'protected'
            : 'public'
      const isStatic
        = mods?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) ?? false

      if (ts.isMethodDeclaration(m)) {
        return {
          name: memberName,
          kind: 'method',
          signature: formatSignature(m, ctx.sourceFile),
          type: typeStringFrom(m.type, ctx),
          optional: !!m.questionToken,
          readonly: false,
          visibility,
          static: isStatic,
          doc: memberDoc,
        }
      }
      if (ts.isPropertyDeclaration(m)) {
        return {
          name: memberName,
          kind: 'property',
          signature: m.getText(ctx.sourceFile).replace(RE_TRAILING_SEMI, ''),
          type: typeStringFrom(m.type, ctx),
          optional: !!m.questionToken,
          readonly:
            mods?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false,
          visibility,
          static: isStatic,
          doc: memberDoc,
        }
      }
      if (ts.isConstructorDeclaration(m)) {
        return {
          name: 'constructor',
          kind: 'constructor',
          signature: `(${m.parameters.map(p => p.getText(ctx.sourceFile)).join(', ')})`,
          type: { text: '', refs: [] },
          optional: false,
          readonly: false,
          visibility,
          static: false,
          doc: memberDoc,
        }
      }
      return null
    })
    .filter((m): m is Member => m !== null)

  return {
    id: makeId(ctx.modulePath, name),
    name,
    kind: 'class',
    language: 'ts',
    module: ctx.modulePath,
    source: locationOf(node, ctx.sourceFile, ctx.root),
    visibility: 'public',
    exported: isSymExported(node, ctx),
    signature: formatSignature(node, ctx.sourceFile),
    typeRefs: [],
    doc,
    tags: Object.keys(doc.customTags).map(t => t.replace(RE_LEADING_AT, '')),
    members,
    typeParameters: (node.typeParameters ?? []).map(tp => ({
      name: tp.name.text,
      constraint: tp.constraint ? typeStringFrom(tp.constraint, ctx) : null,
      default: tp.default ? typeStringFrom(tp.default, ctx) : null,
    })),
  }
}

/**
 * First pass: collect names that will become SymbolIds, so that typeStringFrom
 * can linkify identifiers referencing them.
 */
export function collectNames(sourceFile: ts.SourceFile, root: string, moduleOverride?: string): Map<string, string> {
  const modulePath = moduleOverride ?? moduleOf(root, sourceFile.fileName)
  const names = new Map<string, string>()
  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
      if (stmt.name)
        names.set(stmt.name.text, makeId(modulePath, stmt.name.text))
    }
    else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.set(stmt.name.text, makeId(modulePath, stmt.name.text))
    }
    else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          names.set(d.name.text, makeId(modulePath, d.name.text))
        }
      }
    }
  }
  return names
}

export function extractFromFile(sourceFile: ts.SourceFile, checker: ts.TypeChecker, root: string, knownNames: Map<string, string>, moduleOverride?: string): VSymbol[] {
  const modulePath = moduleOverride ?? moduleOf(root, sourceFile.fileName)
  const ctx: WalkContext = {
    checker,
    sourceFile,
    modulePath,
    root,
    knownNames,
  }

  // For package files (moduleOverride set), use the checker to resolve all
  // exports — this follows re-exports through barrel files.
  if (moduleOverride) {
    return extractFromModuleExports(sourceFile, checker, ctx)
  }

  const results: VSymbol[] = []
  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      results.push(extractInterface(stmt, ctx))
    }
    else if (ts.isTypeAliasDeclaration(stmt)) {
      results.push(extractTypeAlias(stmt, ctx))
    }
    else if (ts.isFunctionDeclaration(stmt)) {
      const s = extractFunction(stmt, ctx)
      if (s)
        results.push(s)
    }
    else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const s = extractVariable(stmt, decl, ctx)
        if (s)
          results.push(s)
      }
    }
    else if (ts.isEnumDeclaration(stmt)) {
      results.push(extractEnum(stmt, ctx))
    }
    else if (ts.isClassDeclaration(stmt)) {
      const s = extractClass(stmt, ctx)
      if (s)
        results.push(s)
    }
  }
  return results
}

/**
 * Extract symbols by resolving a module's exports through the type checker.
 * This follows re-exports, barrel files, and `export * from` chains —
 * the right strategy for package .d.ts files.
 */
function extractFromModuleExports(sourceFile: ts.SourceFile, checker: ts.TypeChecker, ctx: WalkContext): VSymbol[] {
  const fileSymbol = checker.getSymbolAtLocation(sourceFile)
  if (!fileSymbol)
    return []

  const exports = checker.getExportsOfModule(fileSymbol)
  const results: VSymbol[] = []

  for (const sym of exports) {
    // The public export name — may differ from the declaration name
    // when re-exported with an alias (e.g. `export { Foo$1 as Foo }`).
    const exportName = sym.name

    // Resolve aliases (re-exports).
    const resolved
      = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym
    const decls = resolved.getDeclarations()
    if (!decls || decls.length === 0)
      continue
    const decl = decls[0]!
    const declSourceFile = decl.getSourceFile()

    // Build a context for the declaration's actual source file (may differ
    // from the barrel file). Force exported=true since the checker told us
    // this symbol is in the module's public exports.
    const declCtx: WalkContext = {
      ...ctx,
      sourceFile: declSourceFile,
      forceExported: true,
    }

    let extracted: VSymbol | null = null

    if (ts.isInterfaceDeclaration(decl)) {
      extracted = extractInterface(decl, declCtx)
    }
    else if (ts.isTypeAliasDeclaration(decl)) {
      extracted = extractTypeAlias(decl, declCtx)
    }
    else if (ts.isFunctionDeclaration(decl)) {
      extracted = extractFunction(decl, declCtx)
    }
    else if (ts.isVariableDeclaration(decl)) {
      const stmt = decl.parent?.parent
      if (stmt && ts.isVariableStatement(stmt))
        extracted = extractVariable(stmt, decl, declCtx)
    }
    else if (ts.isEnumDeclaration(decl)) {
      extracted = extractEnum(decl, declCtx)
    }
    else if (ts.isClassDeclaration(decl)) {
      extracted = extractClass(decl, declCtx)
    }

    // Override name and id with the public export name, which may
    // differ from the declaration name due to re-export aliasing.
    if (extracted) {
      if (extracted.name !== exportName) {
        extracted.name = exportName
        extracted.id = makeId(ctx.modulePath, exportName)
      }
      results.push(extracted)
    }
  }
  return results
}
