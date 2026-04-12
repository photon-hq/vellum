---
"@vellum-docs/core": minor
"@vellum-docs/extractor-typescript": minor
"@vellum-docs/engine-nunjucks": minor
"@vellum-docs/profile-markdown": minor
"@vellum-docs/profile-mintlify": minor
"@vellum-docs/cli": minor
---

Initial release of Vellum.

- TypeScript extractor with full type checker support and TSDoc parsing
- Nunjucks template engine with symbol/symbols/module globals and filters
- Markdown and Mintlify renderer profiles
- Package extraction from npm dependencies via `.d.ts` resolution
- Disk-backed symbol cache at `node_modules/.cache/vellum/`
- CLI: `vellum build`
