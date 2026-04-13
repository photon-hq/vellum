# @vellum-docs/extractor-typescript

## 0.2.1

### Patch Changes

- 65e5344: Fix re-export alias handling: use the public export name (e.g. `AttachmentInfo`) instead of the internal declaration name (e.g. `AttachmentInfo$1`) when extracting symbols from package `.d.ts` files with `export { X as Y }` patterns.
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

## 0.1.1

### Patch Changes

- d2c7db5: Add a parsing strategy to directly read package.json
  - @vellum-docs/core@0.1.1

## 0.1.0

### Minor Changes

- 04fb926: Initial release of Vellum.

  - TypeScript extractor with full type checker support and TSDoc parsing
  - Nunjucks template engine with symbol/symbols/module globals and filters
  - Markdown and Mintlify renderer profiles
  - Package extraction from npm dependencies via `.d.ts` resolution
  - Disk-backed symbol cache at `node_modules/.cache/vellum/`
  - CLI: `vellum build`

### Patch Changes

- Updated dependencies [04fb926]
  - @vellum-docs/core@0.1.0
