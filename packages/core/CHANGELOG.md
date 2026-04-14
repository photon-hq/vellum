# @vellum-docs/core

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

## 0.2.3

## 0.2.2

## 0.2.1

## 0.2.0

### Minor Changes

- 852d257: - Add `@vellum-docs/language-server` - LSP with completions, hover, go-to-definition, and diagnostics for `.vel` templates
  - Move `findConfig`/`loadConfig` to `@vellum-docs/core` (shared by CLI and LSP)
  - Fix ESM package resolution (`readTypesFromDisk` follows pnpm symlinks via `realpathSync`, walks parent dirs)
  - Fix TS extractor `getSourceFile` for symlinked package paths
  - Add `language` field to `SymbolQuery`
  - Add disk cache (`DiskCache`) at `node_modules/.cache/vellum/`

## 0.1.1

## 0.1.0

### Minor Changes

- 04fb926: Initial release of Vellum.

  - TypeScript extractor with full type checker support and TSDoc parsing
  - Nunjucks template engine with symbol/symbols/module globals and filters
  - Markdown and Mintlify renderer profiles
  - Package extraction from npm dependencies via `.d.ts` resolution
  - Disk-backed symbol cache at `node_modules/.cache/vellum/`
  - CLI: `vellum build`
