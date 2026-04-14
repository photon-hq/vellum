import { relative } from 'node:path'
import ts from 'typescript'

export function moduleOf(root: string, fileName: string): string {
  return relative(root, fileName).replace(/\\/g, '/')
}

export function makeId(modulePath: string, qualifiedName: string): string {
  return `ts:${modulePath}#${qualifiedName}`
}

export function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

export function locationOf(node: ts.Node, sourceFile: ts.SourceFile, root: string) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
  return {
    file: relative(root, sourceFile.fileName).replace(/\\/g, '/'),
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  }
}

/**
 * Get the leading `/** ... *\/` JSDoc comment text for a node, if any.
 * Returns the raw comment including delimiters.
 */
export function getLeadingJSDoc(node: ts.Node, sourceFile: ts.SourceFile): string {
  const text = sourceFile.text
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart())
  if (!ranges)
    return ''
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i]!
    if (r.kind !== ts.SyntaxKind.MultiLineCommentTrivia)
      continue
    const slice = text.slice(r.pos, r.end)
    if (slice.startsWith('/**'))
      return slice
  }
  return ''
}

/**
 * Canonical declaration text for a node — JSDoc stripped, bodies removed,
 * printer-normalized. Mirrors what `tsc --declaration` would emit for the
 * surface of the symbol.
 */
const RE_TRAILING_SEMI = /;$/

const declarationPrinter = ts.createPrinter({
  removeComments: true,
  omitTrailingSemicolon: false,
})

// ts.factory.cloneNode exists at runtime since TS 4.0 but isn't in the public
// type declarations. It creates a shallow copy with pos=-1 / end=-1 which
// detaches the node from source text, preventing the printer from re-emitting
// original trivia. This is far more stable than the previously-used private
// `getSynthesizedDeepClone` API.
const cloneNode: <T extends ts.Node>(n: T) => T
  = (ts.factory as unknown as { cloneNode: <T extends ts.Node>(n: T) => T }).cloneNode

/**
 * Combined transform visitor that strips function/method/constructor/accessor
 * bodies and detaches every node from source positions via cloneNode so the
 * printer doesn't re-emit original trivia (JSDoc, etc.).
 */
function stripBodiesAndDetach(context: ts.TransformationContext): ts.Visitor {
  const visit: ts.Visitor = (node) => {
    // Visit children first so they are detached before the parent.
    const visited = ts.visitEachChild(node, visit, context)
    if (ts.isFunctionDeclaration(visited)) {
      return ts.factory.updateFunctionDeclaration(
        visited,
        visited.modifiers,
        visited.asteriskToken,
        visited.name,
        visited.typeParameters,
        visited.parameters,
        visited.type,
        undefined,
      )
    }
    if (ts.isMethodDeclaration(visited)) {
      return ts.factory.updateMethodDeclaration(
        visited,
        visited.modifiers,
        visited.asteriskToken,
        visited.name,
        visited.questionToken,
        visited.typeParameters,
        visited.parameters,
        visited.type,
        undefined,
      )
    }
    if (ts.isConstructorDeclaration(visited)) {
      return ts.factory.updateConstructorDeclaration(
        visited,
        visited.modifiers,
        visited.parameters,
        undefined,
      )
    }
    if (ts.isGetAccessor(visited)) {
      return ts.factory.updateGetAccessorDeclaration(
        visited,
        visited.modifiers,
        visited.name,
        visited.parameters,
        visited.type,
        undefined,
      )
    }
    if (ts.isSetAccessor(visited)) {
      return ts.factory.updateSetAccessorDeclaration(
        visited,
        visited.modifiers,
        visited.name,
        visited.parameters,
        undefined,
      )
    }
    // Detach unmodified nodes from source positions.
    return cloneNode(visited)
  }
  return visit
}

export function formatSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  if (ts.isVariableStatement(node))
    return node.getText(sourceFile).replace(RE_TRAILING_SEMI, '')

  // Strip bodies and detach from source positions in a single transform pass
  // so leading JSDoc trivia isn't re-emitted by the printer.
  const result = ts.transform(node, [
    ctx => n => ts.visitNode(n, stripBodiesAndDetach(ctx)) as ts.Node,
  ])
  const stripped = result.transformed[0] as ts.Node
  const text = declarationPrinter.printNode(ts.EmitHint.Unspecified, stripped, sourceFile)
  result.dispose()
  return text
}
