# @vellum-docs/engine-nunjucks

## 0.3.0

### Minor Changes

- 2a9986c: Add `vellum build --watch` with per-template invalidation

  Edit a template or a source file and Vellum re-renders only the output files affected by the change. A docs project that wires `vellum build --watch` alongside the host's dev server (Next.js, Mintlify, etc.) no longer needs a restart loop to see TSDoc edits.

  ```sh
  vellum build --watch
  ```

  ### How invalidation works

  Templates are instrumented while rendering. The `symbol()`, `symbols()`, and `module()` globals record what each `.vel` file actually read:

  - `symbol(id)` - the looked-up `SymbolId`,
  - `module(path)` - the module path,
  - `symbols(query)` - the verbatim query _and_ the resulting ids.

  On a source-file change, Vellum diffs the file's old vs new symbols (source-position-insensitive content hash) and re-renders templates whose recorded reads intersect the diff. Added symbols are re-matched against each template's prior queries so a new `symbols({ tag: 'foo' })` result triggers the right renders.

  Template edits re-render only that template. Config changes tear down the watcher and re-prime. Render and extract errors log and keep the previous output on disk - the watcher stays alive.

  ### API changes (minor - pre-1.0)

  **`TemplateEngine.render` returns `RenderResult`**, not `string`. Custom engines update the return shape:

  ```ts
  // before
  async render(source, ctx): Promise<string> { ... }

  // after
  async render(source, ctx): Promise<RenderResult> {
    return { output }
    // or { output, reads } when ctx.reads was supplied
  }
  ```

  **`SymbolIndex` gains `symbolsByFile` and `removeByFile`.** Custom index implementations need both. `InMemorySymbolIndex` now tracks per-file provenance via `Symbol.source.file`.

  **`matchesQuery(sym, query)`** is exported from `@vellum-docs/core` - the exact predicate `InMemorySymbolIndex.symbols()` uses, reusable by tooling that needs to test a single symbol against a query.

  ### New exports (`@vellum-docs/core`)

  - `TemplateReads`, `createTemplateReads()`
  - `SymbolDiff`, `diffSymbols`, `hashSymbol`, `mergeDiffs`, `emptyDiff`, `isEmptyDiff`
  - `DependencyGraph`
  - `Vellum.extractLanguage`, `Vellum.renderTemplate`, `Vellum.listTemplates`

  ### New exports (`@vellum-docs/cli`)

  - `runWatch`, `WatchCommandOptions`

  ### Watcher details

  File watching uses [chokidar](https://github.com/paulmillr/chokidar) v4 with Nuxt-style granular filtering: `node_modules`, `.git`, `.turbo`, `dist`, `build`, `coverage`, and the resolved `outDir` are ignored anywhere in the tree, even if a user's `sources[lang].include` would otherwise cover them. Events are debounced 100ms; `awaitWriteFinish` handles editor save races.

  ### Known tradeoff

  Per-file TS extraction isn't meaningful in isolation (cross-file type graph), so `extractLanguage` re-runs the extractor over the whole program on each batch. Invalidation still narrows the _render_ set - which is what dominates latency for a typical docs project - but we don't yet skip extraction for unchanged files beyond the existing content-hash cache.

### Patch Changes

- ad1aa14: Add `cell` filter + `TypeString.oneline` for cell-safe rendering

  Every adopter was hand-rolling the same 5-filter escape chain when dropping types or summaries into markdown table cells:

  ```njk
  {{ m.type.text | replace("\n"," ") | replace("    ","") | replace("|","\\|") | replace("<","&lt;") | replace(">","&gt;") }}
  ```

  Two additions collapse that:

  **`TypeString.oneline?: string`** - populated at extraction time with the whitespace-collapsed form of `text`. Omitted when equal to `text` (single-line case). Fixes the `\n` + indentation problem at source, before any template filter runs.

  **`cell` filter** (profile-routed) - accepts a `TypeString`, plain string, or null. Collapses whitespace as defence-in-depth, routes through the profile's new `cell(value, ctx)` method, which wraps in a code span and escapes `|`. Works for anything cell-bound, not just types.

  Before:

  ```njk
  | `{{ m.name }}` | `{{ m.type.text | replace("\n"," ") | replace("    ","") | replace("|","\\|") | replace("<","&lt;") | replace(">","&gt;") }}` | {{ m.doc.summary }} |
  ```

  After:

  ```njk
  | `{{ m.name }}` | {{ m.type | cell | safe }} | {{ m.doc.summary | cell | safe }} |
  ```

  ### Schema additions (additive)

  - `TypeString.oneline?: string`
  - `RendererProfile.cell(value: string, ctx: RenderContext): string`

  Existing extractors keep working - when `oneline` is absent the filter falls back to `.text`. Existing profiles get the new method implemented in `MarkdownProfile` and `MintlifyProfile`; third-party profiles must add a `cell` implementation.

  ### Out of scope

  `jsx-prop` and `fenced` contexts from the original request. Neither has recurring template pain today; defer until they do.

- 6503a35: Philosophy audit fixes - strict-by-default, dead schema cleanup

  An audit against the newly-written PHILOSOPHY.md surfaced four gaps. This changeset closes them.

  **Strict template rendering is now on by default.** Principle 11 ("fail loudly at build time") was being violated by `throwOnUndefined: false` - a template with a typo (`{{ fn.doc.summaryy }}` instead of `fn.doc.summary`) silently rendered as empty string, and the docs shipped with a blank section. The `NunjucksEngine` now defaults to strict rendering: any output of an undefined value throws, which bubbles to a non-zero build exit.

  Opt-out paths, for the rare cases where silent fallback is wanted during migration:

  - Config: `new NunjucksEngine({ strict: false })`.
  - CLI: `vellum build --no-strict`.

  **This is a behavior change.** Templates that relied on silent-empty for undefined values will now fail. Typical patterns that are still safe: `{% if sym.members %}`, `{{ sym.doc.summary }}` (empty string is defined), `{% for m in sym.members or [] %}`. The patterns that will now break are the ones you wanted to know about anyway.

  **Schema cleanup.** Three dead schema fields removed - they were defined but never populated by any extractor, violating principle 7 ("80% case defines the schema"):

  - `Symbol.signatureResolved?: string` - removed.
  - `Member.kind` values `'index'` and `'call'` - removed from the union. Can be added back with implementation when a TS call/index-signature extractor lands or a language that needs them ships.

  **Docs drift fixes.** ARCHITECTURE.md referenced a `{{ str | tsdoc }}` filter that never existed; replaced with `{{ sym | summary }}` (which does). Principle 2 in PHILOSOPHY.md now explicitly distinguishes "pattern-aware" (OK) from "language-idiosyncratic" (not OK), so `Symbol.discriminator?` is consistent with the stated rule.

- Updated dependencies [2a9986c]
- Updated dependencies [ad1aa14]
- Updated dependencies [6503a35]
  - @vellum-docs/core@0.3.0

## 0.2.4

### Patch Changes

- Updated dependencies [be0adfe]
  - @vellum-docs/core@0.2.4

## 0.2.3

### Patch Changes

- @vellum-docs/core@0.2.3

## 0.2.2

### Patch Changes

- 3fadefd: Canonical `Symbol.signature` + filter renames

  **`Symbol.signature` is now canonical across every kind.** The TS extractor routes declarations through `ts.createPrinter({ removeComments: true })` on a body-stripped synthetic clone, producing output equivalent to `tsc --declaration`: JSDoc stripped, function/method/accessor bodies removed, printer-normalized formatting. Previously, interfaces/types/enums returned raw source text (with JSDoc intact) and classes/functions returned header-only strings without members.

  **New `declaration` filter** - `{{ sym | declaration }}` returns the raw canonical declaration string (equivalent to `sym.signature`). Use it when you need the text to drop into a fenced block, JSX prop, tooltip, or table cell.

  **Renamed filters to drop the misleading `mdx` prefix** - they route through the active renderer profile, which can emit Markdown, MDX, or HTML:

  - `mdxSignature` → `signature`
  - `mdxLink` → `link`

  Update templates accordingly. Built-in partials and example templates have been updated.

  - @vellum-docs/core@0.2.2

## 0.2.1

### Patch Changes

- @vellum-docs/core@0.2.1

## 0.2.0

### Minor Changes

- 852d257: - Add `@vellum-docs/language-server` - LSP with completions, hover, go-to-definition, and diagnostics for `.vel` templates
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
