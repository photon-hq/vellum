# Concepts

A short tour of how Vellum thinks about the problem. Ten minutes; skip
if you just want to ship.

## The pipeline

```
  .md.vel                extract              expand               .md
   source     ─────►  symbol index   ─────►  templates   ─────►   output
   files                (cached)            (Nunjucks)           (plain)
```

Three stages, each swappable:

1. **Extract** — per-language. Reads your source files, emits records
   conforming to the [Symbol schema](/reference/schema).
2. **Index** — the queryable store templates read from. Keyed by stable
   `SymbolId`s.
3. **Render** — walks `.vel` templates, expands <span v-pre>`{{ … }}`</span> / <span v-pre>`{% … %}`</span>
   against the index, writes plain output through a renderer profile.

## Extractors vs profiles

The two seams:

- **Extractors** are *language-aware, rendering-unaware*. The TS
  extractor knows about interfaces and generics; it does not know
  about MDX or Mintlify.
- **Profiles** are *rendering-aware, language-unaware*. `MarkdownProfile`
  emits code fences and markdown tables; it does not know whether
  you're documenting TypeScript or Rust.

Templates sit between the two. Filters are the seam — <span v-pre>`{{ sym | signature }}`</span>
routes through the active profile, so the same template emits different
markup against different profiles.

## SymbolIds

Every symbol has a stable id:

```
<language>:<module-path>#<qualified-name>
```

Examples:

```
ts:src/types.ts#User
ts:src/types.ts#User.email
ts:zod#ZodType              (from a published npm package)
```

IDs are stable across runs as long as `(language, module, qualified
name)` don't change. **Renaming a symbol invalidates its ID — on
purpose.** A stale id silently pointing at the wrong thing is worse
than a loud "symbol not found" error. See
[Fail loudly at build time](/philosophy#_11-fail-loudly-at-build-time).

## Shape over syntax

Different source-level constructs produce the same `Symbol` shape when
they mean the same thing to a reader:

| Source form | `kind` | `variants[]` |
| ----------- | ------ | ------------ |
| `enum Status { Ok = 'ok' }` | `"enum"` | populated |
| `const Status = { Ok: 'ok' } as const` | `"enum"` | populated |
| `type Status = { type: 'ok' } \| { type: 'err' }` | `"enum"` | populated |

Template authors write one loop. Templates work across source-keyword
choice and (eventually) across languages. See
[Shape over syntax](/philosophy#_1-shape-over-syntax).

## Sidecar files

Templates use a `.vel` infix before the target extension:

```
docs-src/guide.md.vel        →  docs/guide.md
docs-src/types.mdx.vel       →  docs/types.mdx
docs-src/reference.html.vel  →  docs/reference.html
```

The output extension is explicit in the filename; Vellum never has to
guess what to emit. The `.vel` infix is project-branded — editors can
register a dedicated language mode without fighting other template
tools.

## Output is gitignored

Vellum's output is built in CI, not checked in. Rationale:

- No duplication between source and generated files.
- No merge conflicts.
- Generated files can't drift from source — they're regenerated on
  every build.

Every deploy depends on Vellum running. That's acceptable because
Vellum is a pure function of source + config; failures fail loudly.

## Caching

Symbol extraction is cached on disk at `node_modules/.cache/vellum/`.
Each source file gets a cache entry keyed by
`SHA1(language + path + content)`. Unchanged files skip extraction
entirely. Clear with:

```sh
rm -rf node_modules/.cache/vellum
```

See [Caching](/guide/caching) for the full story.
