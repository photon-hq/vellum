# @vellum-docs/language-server

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
