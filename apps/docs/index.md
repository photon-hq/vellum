---
layout: home

hero:
  name: Vellum
  text: Curated docs that don't drift.
  tagline: "Write templates that reference your source code: types, constants, functions, TSDoc comments. \n\nAnd Vellum compiles them into plain Markdown, MDX, or HTML that any docs host can consume without runtime support."
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why Vellum?
      link: /philosophy
    - theme: alt
      text: View on GitHub
      link: https://github.com/photon-hq/vellum
---

<div v-pre>

````jinja2
# Types

{% set t = symbol("ts:src/types.ts#User") %}

## {{ t.name }}

{{ t.doc.summary }}

```ts
{{ t | declaration }}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
{% for m in t.members -%}
| `{{ m.name }}`{% if m.optional %} _(optional)_{% endif %} | {{ m.type | cell }} | {{ m.doc.summary | cell }} |
{% endfor %}
````

</div>
