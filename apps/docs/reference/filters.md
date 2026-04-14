# Filters

Filters are how templates transform values. Vellum ships two groups:

- **Profile-routed** - output depends on the active `RendererProfile`. Swap the profile, get different markup without touching the template.
- **Plain** - no profile involvement, returns raw strings.

::: tip
Under strict rendering (the default), the `| safe` filter is
redundant - Vellum's Nunjucks engine runs with `autoescape: false`,
so HTML entities pass through unchanged. The examples below still
use `| safe` for familiarity with Jinja/Nunjucks authors.
:::

## Profile-routed filters

### `signature`

Render a symbol's signature as a code fence.

**Signature**

```ts
signature(sym: Symbol): string
```

**Example**

<div v-pre>

````jinja2
{{ sym | signature | safe }}
````

</div>

Emits, for `MarkdownProfile`:

````md
```ts
export interface User {
  id: string
  name: string
}
```
````

For `MintlifyProfile`, the same fenced block - Mintlify MDX understands
code fences natively.

---

### `link`

Render a symbol name as a link to its docs page.

**Signature**

```ts
link(sym: Symbol): string
```

**Example**

<div v-pre>

````jinja2
{{ sym | link | safe }}
````

</div>

Today both shipped profiles emit an inline `` `Name` `` code span. The
filter is a seam - a future profile could render a real link to a doc
route.

---

### `typeRef`

Render an inline type reference, with a tooltip when the profile
supports it.

**Signature**

```ts
typeRef(sym: Symbol): string
```

**Example**

<div v-pre>

````jinja2
Accepts a {{ sym | typeRef | safe }} parameter.
````

</div>

`MarkdownProfile` emits a plain `` `Name` ``; `MintlifyProfile` emits
`<Tooltip tip="…">` with the signature as hover content.

---

### `typeCard`

Render a full "card" for a symbol: signature + docs + examples.

**Signature**

```ts
typeCard(sym: Symbol): string
```

**Example**

<div v-pre>

````jinja2
{{ sym | typeCard | safe }}
````

</div>

`MarkdownProfile` emits a heading + paragraphs + code fences.
`MintlifyProfile` wraps in `<Card>` and groups examples in
`<CodeGroup>`.

---

### `typeString`

Render a `TypeString` value (e.g. a parameter type, return type,
alias target) as inline code.

**Signature**

```ts
typeString(ts: TypeString): string
```

**Example**

<div v-pre>

````jinja2
Returns {{ fn.returnType | typeString | safe }}.
````

</div>

---

### `cell`

Produce a markdown-table-cell-safe rendering of any value. Wraps in a
code span, escapes `|`, collapses whitespace. Accepts a `TypeString`
(uses `.oneline ?? .text`), a plain string, or null/undefined.

**Signature**

```ts
cell(value: TypeString | string | null | undefined): string
```

**Example**

<div v-pre>

````jinja2
| Field | Type | Description |
| ----- | ---- | ----------- |
{% for m in sym.members -%}
| `{{ m.name }}` | {{ m.type | cell | safe }} | {{ m.doc.summary | cell | safe }} |
{% endfor %}
````

</div>

Without `cell`, multi-line pretty-printed unions and summaries
containing `|` or newlines break the surrounding table syntax.

## Plain filters

### `declaration`

Return the canonical declaration text for a symbol. Alias for
`sym.signature`, exposed as a filter for discoverability.

**Signature**

```ts
declaration(sym: Symbol): string
```

**Example**

<div v-pre>

````jinja2
```ts
{{ sym | declaration }}
```
````

</div>

`sym.signature` is printer-normalized (JSDoc stripped, bodies removed,
matches `tsc --declaration` for TypeScript). Use this filter when you
want the raw string to drop into a fenced block, JSX prop, tooltip, or
table cell.

---

### `summary`

Return the doc summary - the first paragraph of the TSDoc comment.

**Signature**

```ts
summary(target: Symbol | DocComment | null): string
```

**Example**

<div v-pre>

````jinja2
{{ sym | summary }}
````

</div>

Works on a `Symbol` (reads `sym.doc.summary`) or a `DocComment`
(reads `.summary`). Returns empty string for null/undefined.

---

### `example`

Return the `nth` `@example` block from a symbol's TSDoc.

**Signature**

```ts
example(sym: Symbol, n?: number): string
```

**Example**

<div v-pre>

````jinja2
{% set code = sym | example(0) %}
{% if code %}
```ts
{{ code }}
```
{% endif %}
````

</div>

Returns empty string if `n` is out of range - templates that iterate
examples explicitly should use `{% for ex in sym.doc.examples %}` to
access `ex.lang`, `ex.title`, etc.

---

Defined in [`packages/engine-nunjucks/src/filters.ts`](https://github.com/photon-hq/vellum/blob/master/packages/engine-nunjucks/src/filters.ts).
