# Partials

Partials are Nunjucks templates shipped with
`@vellum-docs/engine-nunjucks` - reusable layout fragments you can
`{% include %}` into your own templates.

::: tip Copy-edit, don't configure
Partials are **intentionally copy-editable starting points**, not a
configurable theme. If `type-card.njk` doesn't fit your project,
copy the file into your own templates directory and edit it - that's
the customization model. See
[Primitives over themes](/philosophy#_10-primitives-over-themes).
:::

## `type-card`

Renders a full card for a symbol: heading, summary, signature, long
description, and examples.

<div v-pre>

````jinja2
{% set sym = symbol("ts:src/types.ts#User") %}
{% include "@vellum-docs/partials/type-card.njk" %}
````

</div>

**Body**

<div v-pre>

````jinja2
{%- if sym -%}
### {{ sym.name }}

{{ sym.doc.summary }}

{{ sym | signature | safe }}

{%- if sym.doc.description %}

{{ sym.doc.description }}
{%- endif %}

{%- if sym.doc.examples.length > 0 %}

**Examples**

{%- for ex in sym.doc.examples %}
```{{ ex.lang }}
{{ ex.code }}
```
{%- endfor %}
{%- endif %}
{%- endif %}
````

</div>

---

## `constant-table`

Render a markdown table of constants for a given module.

<div v-pre>

````jinja2
{% include "@vellum-docs/partials/constant-table.njk" with { module: "src/constants.ts" } %}
````

</div>

**Body**

<div v-pre>

````jinja2
{%- set consts = symbols({ module: module, kind: "const" }) -%}
| Name | Value | Description |
| ---- | ----- | ----------- |
{%- for c in consts %}
| `{{ c.name }}` | `{{ c.value.text if c.value else "" }}` | {{ c.doc.summary }} |
{%- endfor %}
````

</div>

---

## `function-signature`

Render a function's signature, parameters, and return type.

<div v-pre>

````jinja2
{% set sym = symbol("ts:src/api.ts#fetchUser") %}
{% include "@vellum-docs/partials/function-signature.njk" %}
````

</div>

**Body**

<div v-pre>

````jinja2
{%- if sym -%}
{{ sym | signature | safe }}

{%- if sym.parameters and sym.parameters.length > 0 %}

**Parameters**

{%- for p in sym.parameters %}
- **`{{ p.name }}`**{% if p.optional %} _(optional)_{% endif %} - `{{ p.type.text }}`{% if p.doc %} - {{ p.doc }}{% endif %}
{%- endfor %}
{%- endif %}

{%- if sym.returnType and sym.returnType.text %}

**Returns** - `{{ sym.returnType.text }}`{% if sym.doc.returns %} - {{ sym.doc.returns }}{% endif %}
{%- endif %}
{%- endif %}
````

</div>

---

Partials live at [`packages/engine-nunjucks/src/partials/`](https://github.com/photon-hq/vellum/tree/master/packages/engine-nunjucks/src/partials). The `@vellum-docs/partials/` prefix in `{% include %}` paths resolves to this directory at render time.
