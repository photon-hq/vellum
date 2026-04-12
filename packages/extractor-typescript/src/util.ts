import { relative } from "node:path";
import ts from "typescript";

export const moduleOf = (root: string, fileName: string): string =>
  relative(root, fileName).replace(/\\/g, "/");

export const makeId = (modulePath: string, qualifiedName: string): string =>
  `ts:${modulePath}#${qualifiedName}`;

export const isExported = (node: ts.Node): boolean => {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
};

export const locationOf = (node: ts.Node, sourceFile: ts.SourceFile, root: string) => {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    file: relative(root, sourceFile.fileName).replace(/\\/g, "/"),
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
};

/**
 * Get the leading `/** ... *\/` JSDoc comment text for a node, if any.
 * Returns the raw comment including delimiters.
 */
export const getLeadingJSDoc = (node: ts.Node, sourceFile: ts.SourceFile): string => {
  const text = sourceFile.text;
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart());
  if (!ranges) return "";
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i]!;
    if (r.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const slice = text.slice(r.pos, r.end);
    if (slice.startsWith("/**")) return slice;
  }
  return "";
};

/**
 * Pretty-print the declaration header (without body) for a given node.
 */
export const formatSignature = (node: ts.Node, sourceFile: ts.SourceFile): string => {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    const name = node.name?.getText(sourceFile) ?? "";
    const tps = node.typeParameters?.map((t) => t.getText(sourceFile)).join(", ");
    const tpStr = tps ? `<${tps}>` : "";
    const params = node.parameters.map((p) => p.getText(sourceFile)).join(", ");
    const ret = node.type ? `: ${node.type.getText(sourceFile)}` : "";
    const prefix = ts.isFunctionDeclaration(node) ? "function " : "";
    return `${prefix}${name}${tpStr}(${params})${ret}`;
  }
  if (ts.isVariableStatement(node)) {
    return node.getText(sourceFile).replace(/;$/, "");
  }
  if (ts.isClassDeclaration(node)) {
    // Header only: `class Name<T> extends A implements B`
    const name = node.name?.getText(sourceFile) ?? "";
    const tps = node.typeParameters?.map((t) => t.getText(sourceFile)).join(", ");
    const tpStr = tps ? `<${tps}>` : "";
    const heritage = (node.heritageClauses ?? [])
      .map((h) => h.getText(sourceFile))
      .join(" ");
    return `class ${name}${tpStr}${heritage ? " " + heritage : ""}`;
  }
  // Interfaces, type aliases, enums — full text is a reasonable signature.
  return node.getText(sourceFile);
};
