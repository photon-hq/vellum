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

function stripBodies(context: ts.TransformationContext): ts.Visitor {
  const visit: ts.Visitor = (node) => {
    if (ts.isFunctionDeclaration(node)) {
      return ts.factory.updateFunctionDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        node.parameters,
        node.type,
        undefined,
      )
    }
    if (ts.isMethodDeclaration(node)) {
      return ts.factory.updateMethodDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.questionToken,
        node.typeParameters,
        node.parameters,
        node.type,
        undefined,
      )
    }
    if (ts.isConstructorDeclaration(node)) {
      return ts.factory.updateConstructorDeclaration(
        node,
        node.modifiers,
        node.parameters,
        undefined,
      )
    }
    if (ts.isGetAccessor(node)) {
      return ts.factory.updateGetAccessorDeclaration(
        node,
        node.modifiers,
        node.name,
        node.parameters,
        node.type,
        undefined,
      )
    }
    if (ts.isSetAccessor(node)) {
      return ts.factory.updateSetAccessorDeclaration(
        node,
        node.modifiers,
        node.name,
        node.parameters,
        undefined,
      )
    }
    return ts.visitEachChild(node, visit, context)
  }
  return visit
}

export function formatSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  if (ts.isVariableStatement(node))
    return node.getText(sourceFile).replace(RE_TRAILING_SEMI, '')

  // Detach from source positions so leading JSDoc trivia isn't re-emitted by
  // the printer.
  const synth = (ts as unknown as {
    getSynthesizedDeepClone: <T extends ts.Node>(n: T) => T
  }).getSynthesizedDeepClone(node)

  const result = ts.transform(synth, [
    ctx => n => ts.visitNode(n, stripBodies(ctx)) as ts.Node,
  ])
  const stripped = result.transformed[0] as ts.Node
  const text = declarationPrinter.printNode(ts.EmitHint.Unspecified, stripped, sourceFile)
  result.dispose()
  return text
}
