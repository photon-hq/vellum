---
"@vellum-docs/extractor-typescript": patch
"@vellum-docs/engine-nunjucks": patch
"@vellum-docs/language-server": patch
---

Canonical `Symbol.signature` + filter renames

**`Symbol.signature` is now canonical across every kind.** The TS extractor routes declarations through `ts.createPrinter({ removeComments: true })` on a body-stripped synthetic clone, producing output equivalent to `tsc --declaration`: JSDoc stripped, function/method/accessor bodies removed, printer-normalized formatting. Previously, interfaces/types/enums returned raw source text (with JSDoc intact) and classes/functions returned header-only strings without members.

**New `declaration` filter** — `{{ sym | declaration }}` returns the raw canonical declaration string (equivalent to `sym.signature`). Use it when you need the text to drop into a fenced block, JSX prop, tooltip, or table cell.

**Renamed filters to drop the misleading `mdx` prefix** — they route through the active renderer profile, which can emit Markdown, MDX, or HTML:

- `mdxSignature` → `signature`
- `mdxLink` → `link`

Update templates accordingly. Built-in partials and example templates have been updated.
