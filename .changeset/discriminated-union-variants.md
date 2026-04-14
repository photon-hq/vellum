---
"@vellum-docs/core": patch
"@vellum-docs/extractor-typescript": patch
"@vellum-docs/language-server": patch
---

Extract variants from TS discriminated unions

Closed TS discriminated-union type aliases — unions of inline object types sharing a literal-typed discriminator property — now populate `sym.variants[]` and `sym.discriminator`, the same way the `as const` promotion (0.2.3) did for object consts. One template renders both real enums and discriminated unions.

```ts
/** A change in a group chat. */
export type GroupChange =
  | { readonly type: 'renamed', readonly name: string }
  | { readonly type: 'participantAdded', readonly address: string }
  | { readonly type: 'iconRemoved' }
```

After extraction: `sym.kind === 'enum'`, `sym.discriminator === 'type'`, and `sym.variants[]` is `[{ name: 'renamed', value: ..., fields: [{ name: 'name', ... }] }, ...]`. `aliasOf` stays populated for backward compat; `signature` stays as source form.

Detection picks the candidate property with the most distinct literal values across arms (ties → first). Fall-through cases — named-reference arms (`type X = Foo | Bar`), unions mixing primitives with objects, non-literal discriminators — stay `kind: 'type'` with only `aliasOf` populated.

### Schema additions (both additive)

- `EnumVariant.fields?: Member[]` — per-variant payload, populated for discriminated-union arms and (forward-looking) Rust/Swift/Kotlin enum variants with associated values.
- `Symbol.discriminator?: string` — the discriminator property name.

### Template pattern

```njk
## {{ sym.name }} <kbd>{{ sym.discriminator }}</kbd>

{% for v in sym.variants %}
### `{{ v.value.text }}`

{% for f in v.fields or [] -%}
- **`{{ f.name }}`** — `{{ f.type.text }}`{% if f.doc.summary %} — {{ f.doc.summary }}{% endif %}
{% endfor %}
{% endfor %}
```
