# Vellum — Architecture

Vellum is a templating preprocessor for documentation. It lets docs authors
pull live data — type definitions, constants, function signatures, TSDoc
comments — out of source code and interpolate it into Markdown, MDX, or HTML
at build time.

The output is plain static MDX/MD/HTML that any host (Mintlify, Docusaurus,
Nextra, plain static hosting) can consume without runtime support or custom
components of its own.

TypeScript/JavaScript is the first extractor. The architecture is
deliberately language-agnostic so Python, Rust, Go, etc. can be added later
without reshaping the core.

---

## Goals

- **Dynamic docs, static output.** Authors reference real symbols; the
  compiler emits plain files.
- **Host-agnostic.** Works for Mintlify today, others tomorrow. Host-specific
  quirks live only in renderer profiles.
- **Language-agnostic core.** Extractors plug into a fixed symbol schema.
- **Author-controlled presentation.** Templates expose raw symbol data.
  Authors render it however they want; built-in partials cover the common
  cases.
- **Incremental.** Symbol extraction over a large TS project is slow;
  caching is a first-class concern.

## Non-goals

- No runtime components injected into the host site.
- No replacement for MDX/Markdown themselves — Vellum only preprocesses.
- No structured type query language (see _Design decisions_ below).
- No cross-file import graph in v1.

---

## Pipeline

```
  .mdx.vel              extract            expand                .mdx
   source   ─────►  symbol index  ─────►  templates  ─────►   output
   files              (cached)          (Nunjucks)           (gitignored)
     ▲                    ▲
     │                    │
  author              extractors
                     (TS/JS, ...)
```

Three layers, each swappable:

1. **Extractors** — per language. Read source, emit records conforming to
   the symbol schema below. Cacheable by file hash. Every extractor
   implements the same narrow `Extractor` interface so backends can be
   swapped without touching the symbol index or template layer (see
   _Extractors_ below).
2. **Symbol index** — the single queryable store every template reads from.
   Keyed by stable `SymbolId`s. Language-agnostic.
3. **Template engine + renderer profile** — walks `.mdx.vel` files, expands
   directives against the index using Nunjucks, writes plain output files
   via a renderer profile that knows the host's component vocabulary.

---

## File conventions

### Sidecar source files

Template files use a `.vel` infix before the target extension:

```
docs/guide/types.mdx.vel   →   docs/guide/types.mdx
docs/api/constants.md.vel  →   docs/api/constants.md
docs/legacy/intro.html.vel →   docs/legacy/intro.html
```

The double-extension form keeps the output format explicit in the
filename, so the preprocessor never has to guess what to emit. The
infix-extension form (over in-place directives in normal `.mdx`) lets
the preprocessor treat the source as raw text with no MDX parser
collisions, and makes generated files obviously generated.

`.vel` is project-branded on purpose: it avoids collisions with other
template ecosystems (`.tpl` is claimed by ejs, handlebars, smarty, and
several others) and lets editors register a dedicated language mode
for Vellum source files without fighting anyone.

### Generated output is not checked in

Vellum's output is `.gitignore`d and produced in CI before the host tool
(e.g. Mintlify) runs. Rationale:

- No duplication or merge noise.
- Generated files never drift from source.
- Editing a generated file accidentally has no lasting effect.

Tradeoff: every deploy depends on Vellum running successfully. This is
acceptable because the preprocessor is a pure function of source + config.

---

## Template language

### Nunjucks, not a custom engine

Vellum uses [Nunjucks](https://mozilla.github.io/nunjucks/) with custom
globals and filters. The template engine is not where this project adds
value — the symbol extraction and indexing layer is. Rolling a template
engine costs months and buys nothing.

Nunjucks was chosen over alternatives because:

- Jinja-family syntax is widely understood.
- First-class custom globals, filters, tags, and macros.
- Mature `{% include %}` and `{% macro %}` — authors define their own
  reusable partials, which is effectively user-defined components without
  writing TypeScript.
- Async rendering, which matters when extractors are slow.

Handlebars was rejected for lacking real expressions and awkward control
flow. LiquidJS is viable but has weaker extensibility.

### Delimiters

```
{{ expr }}    inline value
{% tag %}     block / control flow
{# comment #} comment
```

`{{ }}` alone collides with MDX's JSX expression syntax (`{ expr }`) in
editor tooling, even though the preprocessor runs before the MDX parser
ever sees the file. The `{% %}` form has no collisions and is familiar
from Jinja/Liquid/Nunjucks/Twig/Django.

### Author API (globals and filters)

Templates see a small, stable surface:

```ts
// globals
symbol(id: SymbolId): Symbol | null
symbols(query: SymbolQuery): Symbol[]
module(path: string): Module | null

interface SymbolQuery {
  module?: string;        // glob supported, e.g. "src/api/**"
  kind?: SymbolKind | SymbolKind[];
  tag?: string;           // matches anything in symbol.tags
  customTag?: string;     // matches keys in doc.customTags
  prefix?: string;        // name starts with
  exportedOnly?: boolean; // default: true
}
```

Shipped filters:

```
{{ sym | link }}            render name as a link to its docs page (profile-routed)
{{ sym | signature }}       signature as a code fence, typeRefs linkified (profile-routed)
{{ sym | declaration }}     raw canonical declaration text (alias for sym.signature)
{{ val | cell }}            markdown-table-cell-safe rendering (profile-routed)
{{ str | tsdoc }}           markdown-safe tsdoc rendering
{{ sym | example(0) }}      nth @example block
```

Example template:

```njk
{% set t = symbol("src/types.ts#ExampleType") %}

## {{ t.name }}

{{ t.doc.summary }}

\```ts
{{ t | signature }}
\```

{% for c in symbols({ module: "src/constants.ts", kind: "const" }) %}
| `{{ c.name }}` | `{{ c.value.text }}` | {{ c.doc.summary }} |
{% endfor %}
```

### Built-in partials

To avoid forcing every author to hand-write tables and layouts, Vellum
ships a set of partials under a reserved namespace:

```njk
{% include "@vellum-docs/partials/type-card.njk" with { sym: t } %}
{% include "@vellum-docs/partials/constant-table.njk"
   with { module: "src/constants.ts" } %}
{% include "@vellum-docs/partials/function-signature.njk" with { sym: f } %}
```

Partials are the intended customization point: authors copy one into their
own project and edit it rather than waiting for a new prop to be added
upstream.

---

## Renderer profiles

The same template can target different hosts by swapping a renderer
profile. A profile defines:

- How built-in partials render (e.g. Mintlify's `<Tooltip>` vs a Docusaurus
  equivalent vs plain HTML `<span title="...">`).
- What Markdown/MDX constructs are legal in the output.
- Any post-processing steps the host needs.

Initial profiles:

- **`mintlify`** — emits MDX using only Mintlify's built-in components
  (`<Tooltip>`, `<ParamField>`, `<ResponseField>`, `<CodeGroup>`, `<Card>`,
  `<Accordion>`, callouts) plus plain markdown tables.
- **`html`** — emits plain HTML with no framework assumptions.
- **`markdown`** — emits CommonMark with no component usage at all.

Profile-specific notes:

- Mintlify's `<Tooltip>` takes a **string** tip, not JSX. Type tooltips
  therefore cannot be syntax-highlighted in the hover. The escape hatch is
  a full `TypeCard` partial that expands into a block with a proper code
  fence. This is a target constraint, not something Vellum can paper over.

---

## Symbol model

The symbol model is the contract every extractor must satisfy and every
template reads from. Changing it is a breaking change for templates.

```ts
type SymbolId = string // e.g. "ts:src/types.ts#ExampleType"

interface Symbol {
  id: SymbolId
  name: string
  kind: SymbolKind
  language: 'ts' | 'js' | 'py' | 'rust' | string

  module: string // logical module path, relative to config root
  source: SourceLocation // file, line, column — 1-based
  visibility: 'public' | 'protected' | 'private' | 'internal'
  exported: boolean

  signature: string // canonical declaration — printer-normalized, JSDoc stripped,
                    // bodies removed. For TS, extractor uses `ts.createPrinter`
                    // on a body-stripped synthetic clone (matches `tsc --declaration`).
  signatureResolved?: string // generics/aliases expanded, when different
  typeRefs: TypeRef[] // ranges in `signature` that link to other SymbolIds

  doc: DocComment
  tags: string[] // flat: "deprecated", "beta", "public", ...

  // kind-specific — optional top-level fields, not a tagged union
  parameters?: Parameter[] // functions, methods, constructors
  signatures?: Signature[] // overloaded fns/methods; supersedes the above
  returnType?: TypeString

  typeParameters?: TypeParameter[]

  members?: Member[] // interfaces, type aliases, classes, enums
  extends?: TypeString[]
  implements?: TypeString[]
  aliasOf?: TypeString // type aliases — the RHS

  valueType?: TypeString // const/var — the annotated type
  value?: Literal | null // const/var — statically resolved literal
  mutable?: boolean

  variants?: EnumVariant[] // enums — also populated for the `as const`
                           // enum pattern and TS discriminated unions.
                           // Each variant is { name, value, doc, fields? };
                           // fields[] is populated for arms with payload
                           // (TS union arms, Rust/Swift enum variants
                           // with associated values).
  discriminator?: string   // tagged-union discriminator property name
                           // (TS). Unset for sum types where the variant
                           // name is itself the tag (Rust enum, Swift
                           // enum, etc.).

  extra?: Record<string, unknown> // language-specific escape hatch
}

interface DocComment {
  raw: string
  summary: string // first paragraph, markdown
  description: string // body after summary, markdown
  params: Record<string, string> // paramName → markdown description
  returns: string | null
  examples: Example[]
  throws: { type: TypeString, description: string }[]
  see: string[]
  deprecated: { reason: string } | null
  since: string | null
  customTags: Record<string, string[]> // @internal, @beta, @category, ...
}

interface Example {
  title: string | null
  lang: string
  code: string
  description: string | null
}

interface TypeString {
  text: string // pretty-printed type, source syntax
  oneline?: string // whitespace-collapsed form for cells/tooltips;
                   // omitted when equal to `text`. `refs` offsets are
                   // into `text`, not `oneline`.
  refs: TypeRef[] // positions linking to known SymbolIds
}

interface TypeRef {
  start: number // offset within the enclosing string
  end: number
  symbolId: SymbolId
}

interface Parameter {
  name: string
  type: TypeString
  optional: boolean
  rest: boolean
  defaultValue: Literal | null
  doc: string // from @param
}

interface Signature { // one per overload
  parameters: Parameter[]
  returnType: TypeString
  typeParameters: TypeParameter[]
  doc: DocComment
}

interface TypeParameter {
  name: string
  constraint: TypeString | null
  default: TypeString | null
}

interface Member {
  name: string
  kind: 'property' | 'method' | 'constructor' | 'index' | 'call'
  signature: string
  type: TypeString
  optional: boolean
  readonly: boolean
  visibility: 'public' | 'protected' | 'private'
  static: boolean
  doc: DocComment
}

interface EnumVariant {
  name: string
  value: Literal | null
  doc: DocComment
}

interface Literal {
  kind:
    | 'string' | 'number' | 'boolean' | 'bigint'
    | 'null' | 'undefined' | 'object' | 'array' | 'expression'
  text: string // source form, always present
  value?: string | number | boolean // parsed form, for primitives only
}

interface SourceLocation {
  file: string // relative to repo root
  line: number // 1-based
  column: number
  endLine: number
  endColumn: number
}

type SymbolKind
  = | 'function' | 'method' | 'constructor'
    | 'class' | 'interface' | 'type' | 'enum' | 'namespace' | 'module'
    | 'const' | 'variable' | 'property'
    | 'parameter' | 'typeParameter'
    | 'unknown'
```

### SymbolId format

```
<language>:<module-path>#<qualified-name>
```

Examples:

```
ts:src/types.ts#ExampleType
ts:src/types.ts#ExampleType.field
ts:src/api.ts#createUser
py:vellum/extract.py#Extractor.run
```

IDs are stable across runs as long as `(language, module, qualified name,
kind)` are stable. Renaming a symbol invalidates its ID — that is
intentional, since stale IDs should fail loudly rather than silently point
at the wrong thing.

---

## Extractors

Every language extractor implements the same interface:

```ts
interface Extractor {
  language: string // "ts", "py", "rust", ...
  extensions: string[] // [".ts", ".tsx", ".mts", ...]
  extract: (input: ExtractInput) => Promise<Symbol[]>
}

interface ExtractInput {
  files: string[] // absolute paths to project source files
  root: string // project root for module-path resolution
  config: unknown // language-specific config slice
  packageFiles?: PackageFile[] // .d.ts from npm packages (see below)
}

interface PackageFile {
  file: string // absolute path to the resolved .d.ts
  packageName: string // original specifier, e.g. "zod" or "next/font"
}
```

This is the only contract the rest of the system sees. Backends can be
swapped without touching the symbol index or template layer, which is
what makes the "watch list" items below cheap to adopt later.

### Package extraction

Source config supports a `packages` array alongside `include`:

```ts
sources: {
  ts: {
    include: ['src'],
    packages: ['zod', '@tanstack/react-query'],
  },
}
```

The orchestrator resolves each package specifier to its `.d.ts` entry
point through three strategies (in order):

1. `require.resolve("pkg/package.json")` → read `types`/`typings` field
2. `require.resolve("pkg")` → check for co-located `.d.ts`
3. `@types/pkg` fallback

The resolved files are passed to the extractor via `packageFiles`. The TS
extractor uses `checker.getExportsOfModule()` to follow re-exports through
barrel files, ensuring all public API symbols are captured even when the
package's `index.d.ts` is just `export { X } from './internal'` chains.

Symbols from packages use the package specifier as their module path in
`SymbolId`s — e.g. `ts:zod#ZodType` — rather than the resolved file path
which is package-manager-specific and unstable.

### TypeScript backend (v1): raw TypeScript compiler API

The TypeScript extractor is built directly on the `typescript` package
with a **custom `CompilerHost`**. TSDoc comments are parsed with
`@microsoft/tsdoc`.

**Why this choice:**

1. **Full type checker.** Only a real checker can populate the
   `signatureResolved` field (generics expanded, aliases followed) and
   resolve cross-file `typeRefs` reliably. Parser-only backends (oxc,
   swc, tree-sitter) can't do either without us reimplementing the
   checker on top.
2. **Resilient to broken checkouts.** A custom `CompilerHost` lets us
   synthesize an in-memory program from whatever files Vellum is pointed
   at, without requiring a valid `tsconfig.json` or a fully typechecking
   project. This is the standard escape hatch for file-at-a-time
   operation.
3. **Battle-tested.** A decade of edge cases have been found and fixed.
   For a tool that has to cope with any TS project anyone throws at it,
   this matters more than raw speed.
4. **Incremental.** `createWatchProgram` / builder programs give us
   reasonable incremental reparse behavior out of the box.

**Why not ts-morph:** adds an ergonomic object layer over the same
compiler, but its `Project` abstraction fights the file-at-a-time mode
we want and carries extra allocation overhead on cold start. The raw
API is more code but cleaner semantics for what we're doing.

**Why not `@microsoft/api-extractor` / `api-extractor-model`:**
api-extractor's symbol model is mature and tempting to adopt wholesale,
but it's explicitly TypeScript-flavored and tied to a single-entry-point
rollup worldview. Adopting it undermines Vellum's language-agnostic
core. The types-as-strings decision in Vellum's schema exists precisely
so Python and Rust extractors can hit the same contract later, which
`api-extractor-model` can't accommodate.

### Watch list (future backends)

These are tracked but deliberately **not** chosen for v1. Swapping to
any of them is a matter of implementing the `Extractor` interface.

- **`@typescript/native-preview` (tsgo).** The Go-native port of the
  TypeScript compiler. Microsoft has reported ~10x speedups over tsc on
  large codebases. The reason it's not the v1 choice: as of early 2026
  the public plan of record is CLI-first, with a Node-callable compiler
  API as a later milestone. Shelling out to a CLI doesn't give us
  structured symbol data. Once a library API lands, swapping is
  low-effort — the interface is designed for it.
- **`oxc-parser` + a hand-built cross-file symbol index.** Extremely
  fast Rust parser, napi bindings on npm. No type checker, ever —
  that's a stated non-goal of oxc. Viable as a hybrid if tsc-based
  extraction turns out to be too slow in CI: oxc handles the parse,
  Vellum tracks identifier-to-declaration links via a lightweight name
  graph, and falls back to the tsc backend for symbols that genuinely
  need resolved generics. Not built until real measurements show we
  need it.
- **`swc`.** Same class as oxc — fast parser, no checker. No reason to
  prefer over oxc if we go down the parser-only path.

---

## Design decisions

### 1. Types as strings with ref ranges, not a structured type tree

Alternatives considered: TypeDoc-style recursive type unions
(`ReferenceType | UnionType | IntersectionType | ...`).

**Chosen:** `TypeString = { text, refs[] }`. The extractor stringifies the
type in source syntax, and records byte ranges inside that string where
known symbols are referenced.

**Why:** A structured type tree leaks TypeScript semantics into the schema
and kills the language-agnostic goal — every extractor would have to
invent its own version. String+refs round-trips cleanly through any
language: stringify however the source language usually displays types,
mark the spans that link elsewhere, done.

**Cost:** Templates can't do deep type queries like "give me all members
of this union." In practice doc authors rarely want that — when they do,
the `extra` field is the escape hatch.

### 2. Overloads as `signatures[]` on one symbol, not multiple symbols

**Chosen:** A single `Symbol` with `signatures: Signature[]` when there
are overloads. For the single-signature common case, the extractor also
populates top-level `parameters`/`returnType` so simple templates don't
have to branch.

**Why:** Keeps `SymbolId`s stable. `ts:src/foo.ts#bar` always refers to
"the thing named `bar` in `foo.ts`" regardless of how many overloads it
has. Matches how TSDoc thinks about overloads.

### 3. Flat `Symbol` with optional fields, not a tagged union

**Chosen:** One interface, kind-specific fields are optional.

**Why:** Tagged unions are type-safer in TypeScript but awkward in
templates — every field access would require a `kind` check. A flat shape
means `{{ sym.members }}` just works when `sym` is an interface and is
`undefined` otherwise; Nunjucks handles `undefined` gracefully.

**Cost:** The schema doesn't self-document which fields go with which
kind. Mitigated by a conformance table in the docs mapping `kind` → valid
fields, and by extractors always populating the same fields for the same
kind.

### 4. Sidecar source files, not in-place directives

**Chosen:** `.mdx.vel` → `.mdx` as distinct files.

**Why:** The preprocessor can treat the source as raw text without
worrying about MDX parser collisions. Generated files are obviously
generated. Host tools (Mintlify) only ever see normal `.mdx`.

### 5. Generated output gitignored, built in CI

**Chosen:** Output directory is `.gitignore`d. CI runs Vellum before
the host's build.

**Why:** No duplication, no merge noise, no drift.

**Cost:** Every deploy depends on Vellum running. Acceptable because the
preprocessor is a pure function of source + config, and failures fail
loudly at build time.

### 6. `kind` describes shape, not source syntax

**Chosen:** Extractors promote `kind` based on the *shape* a symbol
presents to a reader, not the exact source keyword it was declared
with. Two TS-side instances today:

- **`as const` enum promotion.** `const X = { a: 'foo' } as const` (or
  its d.ts form `declare const X: { readonly a: 'foo' }`) becomes
  `kind: 'enum'` with `variants[]` populated. The self-referential
  `type X = (typeof X)[keyof typeof X]` sibling is suppressed so `X`
  appears once.
- **Discriminated-union promotion.** `type X = { type: 'a'; ... } |
  { type: 'b'; ... }` becomes `kind: 'enum'` with `variants[]` and
  `discriminator` populated. Each variant carries a `fields[]` array
  with the payload properties (using the same `Member` shape as
  interface properties).

Detection is strict — any ambiguity (mixed unions, named-reference
arms, non-literal discriminators, nested non-literal values) falls
through and the symbol keeps its source kind.

**Why:** Vellum is a docs tool, not a type system. A reader of
`MessageEffect` doesn't care whether the SDK used `enum`, `as const`, or
a discriminated union — they want the same table. Collapsing by shape
lets template authors write one renderer per *kind of concept*, not one
per source syntax.

The rule also makes the schema **cross-language**. A Rust
`enum Shape { Circle { r: f64 }, Rect { w, h } }`, a Swift `enum` with
associated values, and a Kotlin `sealed class` hierarchy are all the
same shape as a TS discriminated union. Whichever extractor ships
later populates the same enriched `EnumVariant` (tag + fields)
without schema additions.

**Cost:** `sym.kind` no longer matches the source keyword exactly.
`kind === 'enum'` can mean a real `enum`, an `as const` object, or a
TS discriminated union. Templates that care about the distinction
disambiguate via `sym.signature`, which stays faithful to source (for
TS, equivalent to `tsc --declaration` output). The type-vs-value
split the schema is otherwise careful about is deliberately relaxed
here — docs pragmatism over schema purity.

---

## Out of scope (v1)

Items here are **deferred, not rejected**. The architecture is designed
so each can be added later without reshaping the core.

- **AST nodes in the symbol model.** Too language-specific and heavy.
- **Full source bodies.** Only signatures are stored. Bodies can be
  lazy-loaded through a `sym | source` filter if a template asks.
- **Computed / runtime values.** Everything is static extraction.
- **Cross-file import graphs.** Not needed for the stated use cases;
  additive if required later.
- **Multi-language extraction in a single project.** TS/JS first. The
  schema supports other languages but only one extractor ships in v1.

### Planned for post-v1

These are explicit product goals — v1 ships without them, but the
extractor/index layers are being designed so that adding them later
doesn't require rewriting anything.

- **Watch mode / HMR.** `vellum watch` re-extracts only changed files
  and re-renders only the `.mdx.vel` templates that read symbols whose
  `SymbolId` was touched. The disk cache (see below) handles per-file
  invalidation; what's missing is the template-to-symbol dependency
  tracking needed to know which `.vel` files to re-render when a symbol
  changes.
- **Language server (LSP).** A Vellum LSP would serve authors editing
  `.mdx.vel` files: autocomplete for `SymbolId`s in `symbol()` and
  `symbols()` calls, hover previews showing the resolved signature and
  TSDoc summary, go-to-definition jumping from a template reference to
  the TS source declaration, and diagnostics for broken or ambiguous
  references. This is architecturally free: the LSP is just another
  consumer of the same extractor + symbol index that the build uses,
  wrapped in an LSP transport. Watch mode is a prerequisite — the LSP
  shares the same incremental reparse machinery.

---

## Caching

Symbol extraction is cached on disk at `node_modules/.cache/vellum/`.

Each source file gets a cache entry keyed by
`SHA1(language + file path + file content hash)`. The entry is a JSON
file containing the `CacheKey` and the extracted `Symbol[]`. On subsequent
builds, the orchestrator computes the content hash, checks the disk cache,
and skips extraction for any file whose hash matches.

Implementation: `DiskCache` in `packages/core/src/cache.ts`. A hot
in-memory layer (`Map<string, CacheEntry>`) sits in front of disk reads
to avoid repeated I/O within a single build.

The `Cache` interface is pluggable — pass a custom implementation via
`config.cache` to replace the default `DiskCache`. `InMemoryCache` is
shipped as an alternative for tests or CI environments where disk
persistence is unnecessary.

### Known limitation: no transitive invalidation

The cache keys by file content only. If file A imports a type from file B
and file B changes, A's cached symbols may contain stale `typeRefs`
pointing to the old version of B's declarations. A full cache clear
(`rm -rf node_modules/.cache/vellum`) fixes this.

Transitive invalidation via a dependency graph is a future enhancement.
The extractor already has access to the TypeScript checker's module
graph, so the information is available — it just needs to be surfaced
to the cache layer as an additional invalidation signal.

### Package file caching

Package `.d.ts` files are **not** cached per-file in v1. They go through
`extractFromModuleExports` on every build because barrel re-exports make
per-file keying unreliable (the entry file's content doesn't change when
an internal file it re-exports from does). This is acceptable for most
packages since `.d.ts` extraction is fast, but could become a bottleneck
for very large packages.

---

## Resolved decisions

These were previously open and are now settled:

- **Caching layer.** Disk-backed, `node_modules/.cache/vellum/`,
  file-hash-keyed JSON. See above.
- **Config file format.** `vellum.config.ts` (also `.mts`, `.js`, `.mjs`),
  loaded via `jiti`. Default export of a `VellumConfig` object.
- **CLI surface.** `vellum build` with `--config` and `--cwd` flags.
  `vellum check` and `vellum watch` are future additions.

---

## Open decisions

- **Transitive cache invalidation.** Per-file hash misses cross-file
  type reference staleness. Needs a dependency graph from the checker.
- **Template-to-symbol dependency tracking.** Needed for watch mode
  to know which `.vel` files to re-render when a symbol changes.
