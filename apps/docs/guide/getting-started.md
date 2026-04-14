# Getting started

Vellum is a build-time documentation preprocessor. You write
templates that reference your source code and Vellum emits plain
Markdown, MDX, or HTML your host renders directly.

This guide takes you from empty repo to rendered docs in about five
minutes.

## Install

```sh
pnpm add -D @vellum-docs/cli @vellum-docs/core \
            @vellum-docs/extractor-typescript \
            @vellum-docs/engine-nunjucks \
            @vellum-docs/profile-markdown
```

The five packages break down as:

| Package | Role |
| ------- | ---- |
| `@vellum-docs/cli` | `vellum build` command. |
| `@vellum-docs/core` | Types, orchestrator, symbol index, cache. |
| `@vellum-docs/extractor-typescript` | Turns `.ts` / `.d.ts` into `Symbol` records. |
| `@vellum-docs/engine-nunjucks` | The `.md.vel` template engine. |
| `@vellum-docs/profile-markdown` | Emits plain Markdown. (Swap for `-mintlify` if you target Mintlify.) |

## Configure

Create `vellum.config.ts` in the repo root:

```ts
// vellum.config.ts
import type { VellumConfig } from '@vellum-docs/core'
import { NunjucksEngine } from '@vellum-docs/engine-nunjucks'
import { TypeScriptExtractor } from '@vellum-docs/extractor-typescript'
import { MarkdownProfile } from '@vellum-docs/profile-markdown'

export default {
  root: import.meta.dirname,
  sources: {
    ts: { include: ['src'] },
  },
  templates: 'docs-src',   // where your `.md.vel` files live
  outDir: 'docs',          // where to write rendered output
  extractors: [new TypeScriptExtractor()],
  engine: new NunjucksEngine(),
  profile: new MarkdownProfile(),
} satisfies VellumConfig
```

## Write a template

Given `src/types.ts`:

```ts
/** A user record returned by the API. */
export interface User {
  /** Unique identifier. */
  id: string
  /** Display name. */
  name: string
  /** Optional email. */
  email?: string
}
```

Create `docs-src/types.md.vel`:

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

## Build

```sh
pnpm vellum build
```

Output in `docs/types.md`:

```ts
export interface User {
    id: string;
    name: string;
    email?: string;
}
```

Rendered as plain Markdown: `# Types`, `## User`, a fenced `ts`
block with the interface signature, and a members table. Your host
— Docusaurus, Next.js, VitePress, plain static — serves that file
directly.

Your host (Docusaurus, Next.js, VitePress, plain static) serves that
file directly.

## Next steps

- Learn the [mental model](/guide/concepts) — extractors, profiles, the pipeline.
- See [Writing templates](/guide/templates) for the full template API.
- Document npm packages with [package extraction](/guide/package-extraction).
- Read about [why Vellum is shaped this way](/philosophy).
