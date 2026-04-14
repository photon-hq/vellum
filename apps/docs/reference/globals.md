# Globals

Three functions are in scope in every `.md.vel` template.

## `symbol(id)`

Look up a single symbol by its `SymbolId`. Returns the `Symbol`
record, or `null` if no symbol with that id is in the index.

**Signature**

```ts
function symbol(id: SymbolId): Symbol | null
```

**Example**

<div v-pre>

````jinja2
{% set t = symbol("ts:src/types.ts#User") %}
## {{ t.name }}
{{ t.doc.summary }}
````

</div>

Under strict rendering (the default), a template that passes a
`Symbol | null` to a filter or output position will fail the build if
the symbol isn't in the index — which is usually what you want. If a
symbol is genuinely optional, guard with `{% if t %}`.

See [Symbol schema](/reference/schema) for the `Symbol` shape.

---

## `symbols(query)`

Return every symbol matching a query. Used to enumerate a module's
exports, list constants by tag, iterate enums, etc.

**Signature**

```ts
function symbols(query?: SymbolQuery): Symbol[]

interface SymbolQuery {
  module?: string
  kind?: SymbolKind | SymbolKind[]
  language?: string
  tag?: string
  customTag?: string
  prefix?: string
  exportedOnly?: boolean
}
```

**Query fields**

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `module` | `string` | — | Module path. Glob patterns supported (`src/api/**`). |
| `kind` | `SymbolKind \| SymbolKind[]` | — | `"function"`, `"interface"`, etc. See [schema](/reference/schema). |
| `language` | `string` | — | `"ts"`, `"py"`, etc. |
| `tag` | `string` | — | Matches `symbol.tags`. |
| `customTag` | `string` | — | Matches keys in `symbol.doc.customTags`. |
| `prefix` | `string` | — | Name starts with. |
| `exportedOnly` | `boolean` | `true` | Only exported symbols. Set `false` to include internals. |

**Example — constants table**

<div v-pre>

````jinja2
| Name | Value | Description |
| ---- | ----- | ----------- |
{% for c in symbols({ module: "src/constants.ts", kind: "const" }) -%}
| `{{ c.name }}` | `{{ c.value.text }}` | {{ c.doc.summary | cell }} |
{% endfor %}
````

</div>

---

## `module(path)`

Resolve a module by its path. Returns `{ path, exports: Symbol[] }` or
`null` if the module isn't in the index.

**Signature**

```ts
function module(path: string): Module | null

interface Module {
  path: string
  exports: Symbol[]
}
```

**Example**

<div v-pre>

````jinja2
{% set m = module("src/types.ts") %}

This module exports {{ m.exports.length }} symbols:

{% for sym in m.exports -%}
- [`{{ sym.name }}`](/api/types#{{ sym.name | lower }})
{% endfor %}
````

</div>

---

Defined in [`packages/engine-nunjucks/src/globals.ts`](https://github.com/photon-hq/vellum/blob/master/packages/engine-nunjucks/src/globals.ts).
