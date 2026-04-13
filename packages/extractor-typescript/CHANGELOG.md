# @vellum-docs/extractor-typescript

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
