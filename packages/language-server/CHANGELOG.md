# @vellum-docs/language-server

## 0.2.2

### Patch Changes

- 3fadefd: Canonical `Symbol.signature` + filter renames

  **`Symbol.signature` is now canonical across every kind.** The TS extractor routes declarations through `ts.createPrinter({ removeComments: true })` on a body-stripped synthetic clone, producing output equivalent to `tsc --declaration`: JSDoc stripped, function/method/accessor bodies removed, printer-normalized formatting. Previously, interfaces/types/enums returned raw source text (with JSDoc intact) and classes/functions returned header-only strings without members.

  **New `declaration` filter** — `{{ sym | declaration }}` returns the raw canonical declaration string (equivalent to `sym.signature`). Use it when you need the text to drop into a fenced block, JSX prop, tooltip, or table cell.

  **Renamed filters to drop the misleading `mdx` prefix** — they route through the active renderer profile, which can emit Markdown, MDX, or HTML:

  - `mdxSignature` → `signature`
  - `mdxLink` → `link`

  Update templates accordingly. Built-in partials and example templates have been updated.

  - @vellum-docs/core@0.2.2

## 0.2.1

### Patch Changes

- @vellum-docs/core@0.2.1

## 0.2.0

### Minor Changes

- 852d257: - Add `@vellum-docs/language-server` — LSP with completions, hover, go-to-definition, and diagnostics for `.vel` templates
  - Move `findConfig`/`loadConfig` to `@vellum-docs/core` (shared by CLI and LSP)
  - Fix ESM package resolution (`readTypesFromDisk` follows pnpm symlinks via `realpathSync`, walks parent dirs)
  - Fix TS extractor `getSourceFile` for symlinked package paths
  - Add `language` field to `SymbolQuery`
  - Add disk cache (`DiskCache`) at `node_modules/.cache/vellum/`

### Patch Changes

- Updated dependencies [852d257]
  - @vellum-docs/core@0.2.0
