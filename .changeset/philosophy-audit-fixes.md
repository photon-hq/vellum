---
"@vellum-docs/core": patch
"@vellum-docs/extractor-typescript": patch
"@vellum-docs/engine-nunjucks": patch
"@vellum-docs/cli": patch
"@vellum-docs/language-server": patch
"@vellum-docs/profile-markdown": patch
"@vellum-docs/profile-mintlify": patch
---

Philosophy audit fixes — strict-by-default, dead schema cleanup

An audit against the newly-written PHILOSOPHY.md surfaced four gaps. This changeset closes them.

**Strict template rendering is now on by default.** Principle 11 ("fail loudly at build time") was being violated by `throwOnUndefined: false` — a template with a typo (`{{ fn.doc.summaryy }}` instead of `fn.doc.summary`) silently rendered as empty string, and the docs shipped with a blank section. The `NunjucksEngine` now defaults to strict rendering: any output of an undefined value throws, which bubbles to a non-zero build exit.

Opt-out paths, for the rare cases where silent fallback is wanted during migration:

- Config: `new NunjucksEngine({ strict: false })`.
- CLI: `vellum build --no-strict`.

**This is a behavior change.** Templates that relied on silent-empty for undefined values will now fail. Typical patterns that are still safe: `{% if sym.members %}`, `{{ sym.doc.summary }}` (empty string is defined), `{% for m in sym.members or [] %}`. The patterns that will now break are the ones you wanted to know about anyway.

**Schema cleanup.** Three dead schema fields removed — they were defined but never populated by any extractor, violating principle 7 ("80% case defines the schema"):

- `Symbol.signatureResolved?: string` — removed.
- `Member.kind` values `'index'` and `'call'` — removed from the union. Can be added back with implementation when a TS call/index-signature extractor lands or a language that needs them ships.

**Docs drift fixes.** ARCHITECTURE.md referenced a `{{ str | tsdoc }}` filter that never existed; replaced with `{{ sym | summary }}` (which does). Principle 2 in PHILOSOPHY.md now explicitly distinguishes "pattern-aware" (OK) from "language-idiosyncratic" (not OK), so `Symbol.discriminator?` is consistent with the stated rule.
