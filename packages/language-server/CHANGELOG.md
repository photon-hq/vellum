# @vellum-docs/language-server

## 0.3.0

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

- be0adfe: Extract variants from TS discriminated unions

  Closed TS discriminated-union type aliases - unions of inline object types sharing a literal-typed discriminator property - now populate `sym.variants[]` and `sym.discriminator`, the same way the `as const` promotion (0.2.3) did for object consts. One template renders both real enums and discriminated unions.

  ```ts
  /** A change in a group chat. */
  export type GroupChange =
    | { readonly type: "renamed"; readonly name: string }
    | { readonly type: "participantAdded"; readonly address: string }
    | { readonly type: "iconRemoved" };
  ```

  After extraction: `sym.kind === 'enum'`, `sym.discriminator === 'type'`, and `sym.variants[]` is `[{ name: 'renamed', value: ..., fields: [{ name: 'name', ... }] }, ...]`. `aliasOf` stays populated for backward compat; `signature` stays as source form.

  Detection picks the candidate property with the most distinct literal values across arms (ties → first). Fall-through cases - named-reference arms (`type X = Foo | Bar`), unions mixing primitives with objects, non-literal discriminators - stay `kind: 'type'` with only `aliasOf` populated.

  ### Schema additions (both additive)

  - `EnumVariant.fields?: Member[]` - per-variant payload, populated for discriminated-union arms and (forward-looking) Rust/Swift/Kotlin enum variants with associated values.
  - `Symbol.discriminator?: string` - the discriminator property name.

  ### Template pattern

  ```njk
  ## {{ sym.name }} <kbd>{{ sym.discriminator }}</kbd>

  {% for v in sym.variants %}
  ### `{{ v.value.text }}`

  {% for f in v.fields or [] -%}
  - **`{{ f.name }}`** - `{{ f.type.text }}`{% if f.doc.summary %} - {{ f.doc.summary }}{% endif %}
  {% endfor %}
  {% endfor %}
  ```

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
