---
"@vellum-docs/extractor-typescript": patch
---

Fix re-export alias handling: use the public export name (e.g. `AttachmentInfo`) instead of the internal declaration name (e.g. `AttachmentInfo$1`) when extracting symbols from package `.d.ts` files with `export { X as Y }` patterns.
