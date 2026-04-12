import {
  DocBlock,
  DocCodeSpan,
  DocComment,
  DocExcerpt,
  DocFencedCode,
  DocLinkTag,
  DocNode,
  DocNodeKind,
  DocParagraph,
  DocPlainText,
  DocSection,
  DocSoftBreak,
  TSDocConfiguration,
  TSDocParser,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";

import type { DocComment as VellumDoc, Example } from "@vellum-docs/core";
import { emptyDocComment } from "@vellum-docs/core";

// Start from the default TSDoc config (which already knows @example, @internal,
// @beta, @public, @deprecated, @param, @returns, @remarks, @see, etc.) and add
// any missing custom tags we want to tolerate without emitting warnings.
const tsdocConfig = new TSDocConfiguration();
const definedTagNames = new Set(
  tsdocConfig.tagDefinitions.map((t) => t.tagName.toLowerCase()),
);
for (const name of ["@category"]) {
  if (definedTagNames.has(name.toLowerCase())) continue;
  tsdocConfig.addTagDefinition(
    new TSDocTagDefinition({
      tagName: name,
      syntaxKind: TSDocTagSyntaxKind.ModifierTag,
    }),
  );
}

const parser = new TSDocParser(tsdocConfig);

/** Recursively collect plain text from a TSDoc DocNode tree. */
const nodeText = (node: DocNode): string => {
  if (node instanceof DocExcerpt) {
    return node.content.toString();
  }
  let out = "";
  for (const child of node.getChildNodes()) {
    out += nodeText(child);
  }
  return out;
};

/** Render a DocNode subtree as markdown (preserving paragraph breaks). */
const nodeMarkdown = (node: DocNode): string => {
  if (node instanceof DocPlainText) return node.text;
  if (node instanceof DocSoftBreak) return " ";
  if (node instanceof DocCodeSpan) return "`" + node.code + "`";
  if (node instanceof DocLinkTag) {
    // {@link Foo} or {@link Foo | alt text}
    if (node.codeDestination) {
      const parts = node.codeDestination.memberReferences.map((r) =>
        r.memberIdentifier ? r.memberIdentifier.identifier : "",
      );
      const target = parts.filter(Boolean).join(".");
      return "`" + (node.linkText || target) + "`";
    }
    if (node.urlDestination) {
      return `[${node.linkText || node.urlDestination}](${node.urlDestination})`;
    }
    return node.linkText ?? "";
  }
  if (node instanceof DocFencedCode) {
    return "```" + (node.language || "") + "\n" + node.code.replace(/\s*$/, "") + "\n```";
  }
  if (node instanceof DocParagraph) {
    let out = "";
    for (const child of node.getChildNodes()) out += nodeMarkdown(child);
    return out.trim();
  }
  if (node instanceof DocSection) {
    const parts: string[] = [];
    for (const child of node.getChildNodes()) {
      const rendered = nodeMarkdown(child);
      if (rendered) parts.push(rendered);
    }
    return parts.join("\n\n");
  }
  let out = "";
  for (const child of node.getChildNodes()) out += nodeMarkdown(child);
  return out;
};

/** Recursively find the first DocFencedCode in a subtree. */
const findFencedCode = (node: DocNode): DocFencedCode | null => {
  if (node instanceof DocFencedCode) return node;
  for (const child of node.getChildNodes()) {
    const found = findFencedCode(child);
    if (found) return found;
  }
  return null;
};

const blockMarkdown = (block: DocBlock | undefined): string => {
  if (!block) return "";
  return nodeMarkdown(block.content).trim();
};

const parseExampleBlock = (block: DocBlock): Example => {
  const fenced = findFencedCode(block.content);
  if (fenced) {
    return {
      title: null,
      lang: fenced.language || "ts",
      code: fenced.code.replace(/\s*$/, ""),
      description: null,
    };
  }
  // No fenced code — treat the whole block as the code body.
  return {
    title: null,
    lang: "ts",
    code: blockMarkdown(block),
    description: null,
  };
};

export const parseTSDoc = (raw: string): VellumDoc => {
  if (!raw.trim()) return emptyDocComment();

  const ctx = parser.parseString(raw);
  const comment: DocComment = ctx.docComment;

  const result: VellumDoc = emptyDocComment();
  result.raw = raw;

  // Summary = first paragraph of summary section; description = remainder.
  const summaryChildren = comment.summarySection.getChildNodes();
  const summaryParts: string[] = [];
  const descriptionParts: string[] = [];
  let seenFirst = false;
  for (const child of summaryChildren) {
    const md = nodeMarkdown(child);
    if (!md) continue;
    if (!seenFirst) {
      summaryParts.push(md);
      seenFirst = true;
    } else {
      descriptionParts.push(md);
    }
  }
  result.summary = summaryParts.join("\n\n").trim();

  // @remarks block (if present) becomes part of description.
  const remarks = blockMarkdown(comment.remarksBlock);
  if (remarks) descriptionParts.push(remarks);
  result.description = descriptionParts.join("\n\n").trim();

  // @param blocks.
  for (const p of comment.params.blocks) {
    result.params[p.parameterName] = blockMarkdown(p);
  }

  // @returns
  if (comment.returnsBlock) {
    result.returns = blockMarkdown(comment.returnsBlock);
  }

  // @deprecated
  if (comment.deprecatedBlock) {
    result.deprecated = { reason: blockMarkdown(comment.deprecatedBlock) };
  }

  // @see blocks — take plain text of each.
  for (const block of comment.seeBlocks) {
    const txt = blockMarkdown(block);
    if (txt) result.see.push(txt);
  }

  // Custom blocks: @example and others.
  for (const block of comment.customBlocks) {
    const name = block.blockTag.tagName;
    if (name === "@example") {
      result.examples.push(parseExampleBlock(block));
    } else {
      const key = name;
      const list = result.customTags[key] ?? [];
      list.push(blockMarkdown(block));
      result.customTags[key] = list;
    }
  }

  // Modifier tags: @beta, @internal, @public, etc. — record as customTags keys.
  for (const tag of comment.modifierTagSet.nodes) {
    const name = tag.tagName;
    if (!(name in result.customTags)) result.customTags[name] = [];
  }

  return result;
};

export { DocNodeKind, nodeText };
