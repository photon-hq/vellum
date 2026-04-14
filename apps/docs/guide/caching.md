# Caching

Symbol extraction is expensive - spinning up a TypeScript program
typechecks a non-trivial project in seconds. Vellum caches aggressively
so only changed files re-extract on every build.

## On disk, by default

Cache location: `node_modules/.cache/vellum/`.

Each source file gets a cache entry keyed by:

```
SHA1(language + file-path + content-hash)
```

On subsequent builds, Vellum computes the content hash, checks the
disk cache, and skips extraction for any file whose hash matches.

Clear with:

```sh
rm -rf node_modules/.cache/vellum
```

## Custom cache

Pass a custom implementation via `config.cache`:

```ts
import { InMemoryCache } from '@vellum-docs/core'

export default {
  // ...
  cache: new InMemoryCache(),  // no disk persistence
} satisfies VellumConfig
```

`InMemoryCache` is useful for CI builds that don't want to preserve
state between runs, or in tests. Write your own `Cache` implementation
(just three methods - `get`, `set`, `clear`) if you need distributed
caching, S3-backed, etc.

## Known limitation: transitive invalidation

The cache keys by **per-file** content only. If file A imports a type
from file B and file B changes, A's cached symbols may still contain
stale `typeRefs` pointing at the old version of B's declarations.

Symptoms: rare but real. Cross-file type references may render
incorrectly after a downstream file changes until a cache clear.

Mitigation today: full cache clear.

```sh
rm -rf node_modules/.cache/vellum
```

Transitive invalidation via a dependency graph is a planned
enhancement. The extractor already has access to the TypeScript
checker's module graph, so the information is available - it just
needs to be surfaced to the cache layer.

## Package files: not cached (yet)

Package `.d.ts` files extracted through
[package extraction](/guide/package-extraction) are *not*
per-file-cached in v1. Barrel re-exports make per-file keying
unreliable - an entry file's content doesn't change when an internal
file it re-exports from does.

`.d.ts` extraction is typically fast enough that the cache miss isn't
visible, but could become a bottleneck for very large packages.
Package-level cache is planned but not scheduled.
