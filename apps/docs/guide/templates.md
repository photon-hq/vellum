# Writing templates

Vellum templates are [Nunjucks](https://mozilla.github.io/nunjucks/) —
Jinja-family syntax. If you've written Jinja, Liquid, Twig, or Django
templates, you already know it.

## Syntax overview

```
{{ expr }}      inline value
{% tag %}       block / control flow
{# comment #}   comment
```

The `{% %}` form is used throughout instead of `{{ }}` for blocks
because `{{ }}` alone collides with MDX's JSX expression syntax in
editor tooling.

## Pulling data

Everything starts with a global:

<div v-pre>

````jinja2
{% set t = symbol("ts:src/types.ts#User") %}
````

</div>

See [Globals](/reference/globals) for the complete API.

## Rendering

Most filters route through the active profile so templates stay
host-agnostic. See [Filters](/reference/filters).

<div v-pre>

````jinja2
{{ sym | signature | safe }}       {# code fence #}
{{ sym | declaration }}            {# raw source-faithful text #}
{{ sym.type | cell }}              {# table-cell-safe rendering #}
````

</div>

## Control flow

<div v-pre>

````jinja2
{% if sym.members %}
  This symbol has members.
{% elif sym.variants %}
  This symbol has variants.
{% else %}
  This symbol is atomic.
{% endif %}

{% for p in sym.parameters %}
  {{ p.name }}: {{ p.type.text }}
{% endfor %}
````

</div>

## Conditional guards

Under strict rendering (default), outputting an undefined value fails
the build. Most conditionals stay idiomatic:

<div v-pre>

````jinja2
{% if sym.members %}...{% endif %}             {# works; empty array → false #}
{% for m in sym.members or [] %}...{% endfor %}  {# default fallback #}
{{ sym.doc.summary }}                           {# empty string is defined #}
````

</div>

What fails under strict mode:

<div v-pre>

````jinja2
{{ sym.doc.summaryy }}                   {# typo — fails #}
{{ null_symbol.name }}                   {# null dereference — fails #}
````

</div>

See [CLI → Strict rendering](/reference/cli#strict-template-rendering-default) for the full rules.

## Partials

Reusable layout fragments shipped with Vellum:

<div v-pre>

````jinja2
{% include "@vellum-docs/partials/type-card.njk" %}
{% include "@vellum-docs/partials/constant-table.njk" with { module: "src/constants.ts" } %}
{% include "@vellum-docs/partials/function-signature.njk" %}
````

</div>

Partials are **copy-editable starting points**. If the layout doesn't
fit, copy the `.njk` file into your templates directory and edit it.
See [Partials reference](/reference/partials).

## Full example

A complete types page, rendering an interface with a member table:

<div v-pre>

````jinja2
# Types

This page is generated from `src/types.ts`.

{% for sym in symbols({ module: "src/types.ts", kind: "interface" }) %}
## {{ sym.name }}

{{ sym.doc.summary }}

{{ sym | signature | safe }}

{%- if sym.members and sym.members.length > 0 %}

| Field | Type | Description |
| ----- | ---- | ----------- |
{% for m in sym.members -%}
| `{{ m.name }}`{% if m.optional %} _(optional)_{% endif %} | {{ m.type | cell }} | {{ m.doc.summary | cell }} |
{% endfor %}
{%- endif %}

{%- for ex in sym.doc.examples %}

```{{ ex.lang }}
{{ ex.code }}
```
{% endfor %}

---
{% endfor %}
````

</div>

That single template handles any number of interfaces in `src/types.ts`
— add a type to your source, rerun `vellum build`, it appears.
