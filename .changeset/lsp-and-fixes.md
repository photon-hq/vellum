---
"@vellum-docs/core": minor
"@vellum-docs/extractor-typescript": minor
"@vellum-docs/engine-nunjucks": minor
"@vellum-docs/profile-markdown": minor
"@vellum-docs/profile-mintlify": minor
"@vellum-docs/cli": minor
"@vellum-docs/language-server": minor
---

- Add `@vellum-docs/language-server` — LSP with completions, hover, go-to-definition, and diagnostics for `.vel` templates
- Move `findConfig`/`loadConfig` to `@vellum-docs/core` (shared by CLI and LSP)
- Fix ESM package resolution (`readTypesFromDisk` follows pnpm symlinks via `realpathSync`, walks parent dirs)
- Fix TS extractor `getSourceFile` for symlinked package paths
- Add `language` field to `SymbolQuery`
- Add disk cache (`DiskCache`) at `node_modules/.cache/vellum/`
