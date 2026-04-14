# Vellum

A build-time documentation preprocessor. Write templates that reference your
source code — types, constants, functions, TSDoc comments — and Vellum
compiles them into plain Markdown, MDX, or HTML that any docs host can
consume without runtime support.

```
  .mdx.vel              extract            expand                .mdx
   source   ─────►  symbol index  ─────►  templates  ─────►   output
   files              (cached)          (Nunjucks)           (plain)
```

## Why

**Curated docs that don't drift.**

There are two common ways to write API docs, and both make you choose:

- **Manual docs**: hand-written Markdown. You pick what to show, write
narrative around it, add the right examples, leave out internal noise.
The result is docs developers actually want to read. But they drift. A
type gets a new field, a function signature changes, a deprecation lands
— and unless someone updates the docs in the same PR, the reference goes
stale. In practice, it always does.

- **Auto-generated docs**: TypeDoc, Rustdoc, JSDoc. Always accurate because
they read the source directly. But they generate *everything*: a wall of
alphabetically sorted API surface with no sense of what matters. The output
is comprehensive but not curated, and customizing the layout means fighting
the tool's theme system. The result is technically correct but rarely what
a developer wants to land on.

Vellum gives you both. You write curated docs: choosing what to surface,
in what order, with whatever narrative and structure fits your readers. But
the type signatures, parameter lists, constants, and descriptions are
pulled live from the source at build time. The code changes, the docs
update. No copy-paste, no drift.

The output is plain MDX / Markdown / HTML. Mintlify, Next.js, Docusaurus,
Nextra, or any other host renders it directly - no plugins, no runtime
JavaScript, no custom components.

## Quick start

### 1. Install

```sh
pnpm add @vellum-docs/cli @vellum-docs/core @vellum-docs/extractor-typescript \
        @vellum-docs/engine-nunjucks @vellum-docs/profile-markdown
```

### 2. Create a config file

```ts
// vellum.config.ts
import type { VellumConfig } from '@vellum-docs/core'
import { NunjucksEngine } from '@vellum-docs/engine-nunjucks'
import { TypeScriptExtractor } from '@vellum-docs/extractor-typescript'
import { MarkdownProfile } from '@vellum-docs/profile-markdown'

export default {
  root: import.meta.dirname,
  sources: { ts: { include: ['src'], packages: ['zod'] } },
  templates: 'docs-src',
  outDir: 'docs',
  extractors: [new TypeScriptExtractor()],
  engine: new NunjucksEngine(),
  profile: new MarkdownProfile(),
} satisfies VellumConfig
```

### 3. Write a template

Create `docs-src/types.mdx.vel`:

```njk
# Types

{% set t = symbol("ts:src/types.ts#User") %}
## {{ t.name }}

{{ t.doc.summary }}

{{ t | signature | safe }}

{% for m in t.members -%}
- **`{{ m.name }}`**{% if m.optional %} _(optional)_{% endif %} — {{ m.doc.summary }}
{% endfor %}
```

### 4. Build

```sh
npx vellum build
```

Output lands in `docs/types.mdx` - a plain MDX file ready for your host.

## File conventions

Template source files use a `.vel` extension appended to the target format:

```
docs-src/types.mdx.vel        →  docs/types.mdx
docs-src/guide.md.vel          →  docs/guide.md
docs-src/reference.html.vel    →  docs/reference.html
```

Generated output should be gitignored and built in CI before the host tool
runs. See `examples/` for working setups.

## Template language

Vellum uses [Nunjucks](https://mozilla.github.io/nunjucks/) (Jinja-family
syntax). Templates have access to:

### Globals

```njk
{# Look up one symbol by its id #}
{% set t = symbol("ts:src/types.ts#User") %}

{# Query many symbols #}
{% for c in symbols({ module: "src/constants.ts", kind: "const" }) %}
| `{{ c.name }}` | `{{ c.value.text }}` | {{ c.doc.summary }} |
{% endfor %}

{# Get a module's exports #}
{% set m = module("src/types.ts") %}
```

**`symbol(id)`** — look up a single symbol by its `SymbolId`
(`"ts:<module>#<name>"`). Returns `null` if not found.

**`symbols(query)`** — query multiple symbols. Query fields:

| Field          | Type                   | Default | Description                        |
| -------------- | ---------------------- | ------- | ---------------------------------- |
| `module`       | `string`               | —       | Module path (glob supported)       |
| `kind`         | `string \| string[]`   | —       | `"function"`, `"interface"`, etc.  |
| `language`     | `string`               | —       | `"ts"`, `"py"`, etc.               |
| `tag`          | `string`               | —       | Match `symbol.tags`                |
| `customTag`    | `string`               | —       | Match `doc.customTags` keys        |
| `prefix`       | `string`               | —       | Name starts with                   |
| `exportedOnly` | `boolean`              | `true`  | Only exported symbols              |

**`module(path)`** — return a module's exported symbols.

### Filters

Most filters route through the active **renderer profile**, so the same
template emits different markup depending on the profile you configured
(`MarkdownProfile`, `MintlifyProfile`, your own). Filters are the seam
between authors and host-specific output.

```njk
{# Profile-routed — output depends on the configured renderer profile #}
{{ sym | signature | safe }}       {# signature wrapped in a code fence #}
{{ sym | link | safe }}            {# name as a link #}
{{ sym | typeRef | safe }}         {# inline name, tooltip if profile supports it #}
{{ sym | typeCard | safe }}        {# full card: signature + docs + examples #}
{{ ts  | typeString | safe }}      {# render a TypeString inline #}
{{ val | cell | safe }}            {# markdown-table-cell-safe; TypeString or string #}

{# Plain — no profile involvement, returns raw strings #}
{{ sym | declaration }}            {# canonical declaration text (alias for sym.signature) #}
{{ sym | summary }}                {# just the doc summary text #}
{{ sym | example(0) }}             {# nth @example code block #}
```

Use `declaration` (or `sym.signature`) when you need the raw declaration
string to drop into a fenced block, JSX prop, tooltip, or table cell. Use
`signature` when you want the profile to decide the fence/formatting. Use
`cell` for any value you're dropping into a markdown table cell — it
collapses whitespace, escapes column separators (`|`), wraps in a code
span, and accepts either a `TypeString` (pulling `.oneline ?? .text`) or
a plain string like `sym.doc.summary`:

```njk
| `{{ m.name }}` | {{ m.type | cell | safe }} | {{ m.doc.summary | cell | safe }} |
```

Without `cell`, multi-line pretty-printed unions and summaries with `|`
or newlines break the surrounding table syntax.

### Built-in partials

For common layouts, include a built-in partial instead of writing the
markup yourself:

```njk
{% include "@vellum-docs/partials/type-card.njk" %}
{% include "@vellum-docs/partials/constant-table.njk" %}
{% include "@vellum-docs/partials/function-signature.njk" %}
```

Partials are the customization point: copy one into your project, edit it,
and `{% include %}` your copy instead.

### Symbol fields

Every symbol exposed to templates has this shape (kind-specific fields are
present only when applicable):

```
sym.id                     SymbolId ("ts:src/types.ts#User")
sym.name                   "User"
sym.kind                   "interface" | "type" | "function" | "const" | ...
sym.module                 "src/types.ts"
sym.exported               true
sym.signature              canonical declaration (printer-normalized, JSDoc stripped, bodies removed — matches `tsc --declaration` for TS)
sym.doc.summary            first paragraph of TSDoc
sym.doc.description        body after summary
sym.doc.params             { paramName: "description" }
sym.doc.returns            "@returns text"
sym.doc.examples[]         [{ lang, code, title, description }]
sym.doc.deprecated         { reason } | null
sym.doc.customTags         { "@tagName": ["value"] }
sym.members[]              interface/class fields (each has .name, .type, .doc, ...)
sym.parameters[]           function params (each has .name, .type, .optional, .doc)
sym.returnType             { text, refs[], oneline? }  // oneline: single-line form for cells/tooltips, present when text spans multiple lines
sym.variants[]             enum members. Each variant is `{ name, value, doc, fields? }` — `fields[]` populated for discriminated-union arms and language-native enums with payloads. Also populated for the `as const` enum pattern — see below.
sym.discriminator          tagged-union discriminator property name (TS) — unset for enums where the variant name itself is the tag.
sym.value                  const value ({ text, kind })
sym.tags[]                 ["deprecated", "beta", ...]
```

Full TypeScript definitions are in `@vellum-docs/core` — see
`packages/core/src/types.ts`.

### The `as const` enum pattern

Many modern TypeScript libraries use an `as const` object in place of a
real `enum` (recommended by the TypeScript handbook and
`typescript-eslint`'s `prefer-literal-enum-member`):

```ts
export const MessageEffect = {
  slam: 'com.apple.MobileSMS.expressivesend.impact',
  loud: 'com.apple.MobileSMS.expressivesend.loud',
} as const
export type MessageEffect = (typeof MessageEffect)[keyof typeof MessageEffect]
```

From the docs consumer's perspective this is interchangeable with a real
`enum`, so the TS extractor **promotes** it:

- `sym.kind` becomes `"enum"` (not `"const"`).
- `sym.variants[]` is populated just like for a real `enum` — one entry
  per property with `name`, `value`, and `doc`.
- `sym.signature` stays as the source form (`const MessageEffect = {...}`
  or `declare const MessageEffect: {...}`) — `kind` drives rendering,
  `signature` stays faithful.
- The self-referential `type MessageEffect = (typeof MessageEffect)[keyof typeof MessageEffect]`
  sibling is suppressed, so the symbol appears once.

Detection is strict: all properties must have **literal** types
(string/number/boolean). Plain object constants (`const CONFIG = { timeout: 5000 }`)
and `as const` objects with non-literal values (functions, nested objects)
fall through to the normal const extraction path unchanged.

Templates written against `sym.variants` render both real enums and
`as const` enums with the same code:

```njk
{% for v in sym.variants %}
| `{{ sym.name }}.{{ v.name }}` | `{{ v.value.text }}` | {{ v.doc.summary }} |
{% endfor %}
```

### Discriminated unions

TypeScript's discriminated-union pattern — a closed union of inline
object types sharing a literal-typed discriminator property — is the
idiomatic way to model sum types with per-variant payload:

```ts
/** A change in a group chat. */
export type GroupChange =
  | { readonly type: 'renamed', readonly name: string }
  | { readonly type: 'participantAdded', readonly address: string }
  | { readonly type: 'iconRemoved' }
```

The extractor promotes these the same way it promotes `as const` enums:

- `sym.kind` becomes `"enum"`.
- `sym.variants[]` carries one entry per arm with `name` (the
  discriminator value as a string), `value` (the discriminator as a
  `Literal`), `doc`, and `fields[]` — the remaining properties on that
  arm with the same shape as interface members (`name`, `type`,
  `readonly`, `optional`, `doc`).
- `sym.discriminator` is set to the property name (`"type"` above).
- `sym.signature` stays as the canonical source form; `sym.aliasOf`
  stays populated for backward compat.

Detection picks the candidate property with the most distinct literal
values across arms (ties → first in source order). Fall-through cases —
named-reference arms (`type X = Foo | Bar`), unions mixing primitives
with objects, arms missing the discriminator — all stay `kind: 'type'`
with only `aliasOf` populated.

```njk
## {{ sym.name }} <kbd>{{ sym.discriminator }}</kbd>

{% for v in sym.variants %}
### `{{ v.value.text }}`

{% for f in v.fields or [] -%}
- **`{{ f.name }}`** — `{{ f.type.text }}`{% if f.doc.summary %} — {{ f.doc.summary }}{% endif %}
{% endfor %}
{% endfor %}
```

The same template also renders language-native sum types (Rust
`enum`, Swift `enum`, Kotlin `sealed class`) when those extractors
ship — they populate `variants[].fields[]` identically.

## SymbolId format

```
<language>:<module-path>#<qualified-name>
```

Examples:

```
ts:src/types.ts#User
ts:src/types.ts#User.email
ts:src/lib/api.ts#fetchUser
```

Module paths are relative to the project root set in `vellum.config.ts`.

## Renderer profiles

A profile controls how filters like `signature`, `link`, `typeRef`, and
`typeCard` produce output. Swap the profile to change target host without
changing templates.

| Package                     | Target    | Description                                        |
| --------------------------- | --------- | -------------------------------------------------- |
| `@vellum-docs/profile-markdown`  | MD / MDX  | Plain code fences and inline code. No components.  |
| `@vellum-docs/profile-mintlify`  | MDX       | Mintlify `<Tooltip>`, `<Card>`, `<CodeGroup>`, etc.|

To write a custom profile, implement the `RendererProfile` interface from
`@vellum-docs/core`:

```ts
import type { RenderContext, RendererProfile, Symbol, TypeString } from '@vellum-docs/core'

export class MyProfile implements RendererProfile {
  readonly name = 'my-host'
  readonly targetExtensions = ['.mdx'] as const

  typeRef(sym: Symbol, ctx: RenderContext): string { /* ... */ }
  signature(sym: Symbol, ctx: RenderContext): string { /* ... */ }
  typeString(ts: TypeString, ctx: RenderContext): string { /* ... */ }
  typeCard(sym: Symbol, ctx: RenderContext): string { /* ... */ }
  link(sym: Symbol, ctx: RenderContext): string { /* ... */ }
}
```

## Writing a custom extractor

To add a new language, implement the `Extractor` interface from
`@vellum-docs/core`:

```ts
import type { ExtractInput, Extractor, Symbol } from '@vellum-docs/core'

export class PythonExtractor implements Extractor {
  readonly language = 'py'
  readonly extensions = ['.py'] as const

  async extract(input: ExtractInput): Promise<Symbol[]> {
    // Parse files in input.files, return Symbol records.
    // Every field must conform to the schema in @vellum-docs/core/types.
  }
}
```

Register it in your config:

```ts
extractors: [new TypeScriptExtractor(), new PythonExtractor()],
sources: {
  ts: { include: ["src"] },
  py: { include: ["lib"] },
},
```

## CLI

```
vellum build [--config <path>] [--cwd <path>] [--no-strict]
```

- `--config` — path to config file (default: auto-discovers
  `vellum.config.{ts,mts,js,mjs}` in cwd)
- `--cwd` — working directory (default: `process.cwd()`)
- `--no-strict` — disable strict template rendering. **Strict is the
  default**: a template that outputs an undefined value (typos like
  `{{ fn.doc.summaryy }}`, missing fields, broken `symbol()` lookups)
  fails the build. Pass `--no-strict` to fall back to silent empty
  output — useful only during migration. You can also set this
  permanently in config via `new NunjucksEngine({ strict: false })`.

## Package extraction

Vellum can extract types from npm packages, not just your own source files.
Add package specifiers to the `packages` array in your source config:

```ts
sources: {
  ts: {
    include: ['src'],
    packages: ['next/font', '@tanstack/react-query', 'zod'],
  },
}
```

Vellum resolves each package to its `.d.ts` entry point (via the `types` /
`typings` field in `package.json`, or falling back to `@types/*`) and
extracts all exported symbols. Symbols use the package specifier as their
module path:

```njk
{% set Schema = symbol("ts:zod#ZodType") %}
{% for sym in symbols({ module: "zod", kind: "class" }) %}
```

Libraries that ship TSDoc in their `.d.ts` files get full doc extraction.
Libraries without TSDoc still get signatures, member lists, and type info —
just with empty `doc.summary` fields.

## Caching

Vellum caches extracted symbols on disk at
`node_modules/.cache/vellum/`. Each source file gets a cache entry keyed
by `SHA1(language + file path + file content hash)`. On subsequent builds,
unchanged files skip extraction entirely.

The cache is automatic — no configuration needed. To clear it:

```sh
rm -rf node_modules/.cache/vellum
```

You can also provide a custom `Cache` implementation in the config:

```ts
import { InMemoryCache } from '@vellum-docs/core'

export default {
  // ...
  cache: new InMemoryCache(), // disable disk cache, use in-memory only
} satisfies VellumConfig
```

**Known limitation:** the cache keys by file content only. If file A
imports from file B and B changes, A's cached symbols may have stale
`typeRefs`. A full rebuild (`rm -rf node_modules/.cache/vellum`) fixes
this. Transitive invalidation via a dependency graph is planned for a
future release.

## Packages

| Package                           | Description                              |
| --------------------------------- | ---------------------------------------- |
| `@vellum-docs/core`                    | Types, interfaces, symbol index, cache, orchestrator |
| `@vellum-docs/extractor-typescript`    | TypeScript extractor (TS compiler API + `@microsoft/tsdoc`) |
| `@vellum-docs/engine-nunjucks`         | Nunjucks template engine with globals, filters, partials |
| `@vellum-docs/profile-markdown`        | Plain Markdown / MDX renderer profile    |
| `@vellum-docs/profile-mintlify`        | Mintlify renderer profile                |
| `@vellum-docs/cli`                     | CLI (`vellum build`)                     |

## Examples

### `examples/basic`

Minimal setup. Three `.vel` templates render types, constants, and an API
function into plain `.mdx` and `.md` files.

```sh
cd examples/basic
pnpm build            # runs: vellum build
cat docs/types.mdx    # generated output
```

### `examples/nextjs`

Full Next.js App Router integration. Vellum outputs `page.mdx` files
directly into `app/docs/reference/*/`, so Next.js serves them via
file-system routing with zero runtime lookup.

```sh
cd examples/nextjs
pnpm docs:build       # runs: vellum build
pnpm dev              # runs: vellum build && next dev
```

Generated pages:
- `/docs/reference/types` — all interfaces and type aliases
- `/docs/reference/constants` — constant table with name, value, description
- `/docs/reference/api` — function signatures with params, returns, examples

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions, the full symbol
model schema, extractor pipeline, and rationale for key choices
(Nunjucks over Handlebars, raw TS compiler API over ts-morph, string-based
types over structured type trees, etc.).

## License

MIT
