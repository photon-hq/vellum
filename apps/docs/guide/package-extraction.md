# Package extraction

Vellum can document npm packages, not just your own source. Declare
them in the `packages` array of your source config:

```ts
sources: {
  ts: {
    include: ['src'],
    packages: ['zod', '@tanstack/react-query', 'next/font'],
  },
}
```

Symbols from packages use the **package specifier** as their module
path in `SymbolId`s:

```
ts:zod#ZodType
ts:@tanstack/react-query#QueryClient
```

Not the resolved `.d.ts` file path - that path is package-manager
specific and moves between installs.

## Resolution strategies

For each declared package, Vellum walks four strategies in order:

| # | Strategy |
| - | -------- |
| 1 | Read the package's `types` / `typings` field from `package.json`, even when `exports` blocks deep access. |
| 2 | `require.resolve("pkg/package.json")` - read `types`/`typings`. |
| 3 | `require.resolve("pkg")` → look for co-located `.d.ts`. |
| 4 | Fall back to `@types/pkg` (DefinitelyTyped). |

The first strategy that produces a resolved `.d.ts` wins. If none do,
Vellum emits a warning and continues.

## Re-export chains

Packages typically re-export through barrel files:

```ts
// zod/lib/index.d.ts
export { ZodString, ZodNumber /* ... */ } from './types'
```

Vellum's TypeScript extractor uses the checker's
`getExportsOfModule()` to follow every re-export, alias, and barrel
chain. You reach the same `ZodString` from the package specifier
regardless of how deeply internal the actual declaration is.

## Documenting a package

Same template API as for local source. Template:

<div v-pre>

````jinja2
# Zod types

{% for sym in symbols({ module: "zod", kind: "class" }) %}
## {{ sym.name }}

{{ sym.doc.summary }}

{{ sym | signature | safe }}
{% endfor %}
````

</div>

Libraries that ship TSDoc in their `.d.ts` files get full doc
extraction. Libraries without TSDoc still get signatures, member
lists, and type info - just with empty `doc.summary` fields.

## Caching notes

Package `.d.ts` files are **not** per-file-cached in v1. Barrel
re-exports make per-file keying unreliable - the entry file's content
doesn't change when an internal file it re-exports from does.
Acceptable for most packages since `.d.ts` extraction is fast; could
become a bottleneck for very large packages.

See [Caching](/guide/caching) for the full story.
