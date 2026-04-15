---
"@vellum-docs/cli": minor
"@vellum-docs/core": minor
"@vellum-docs/engine-nunjucks": minor
---

Add `vellum build --watch` with per-template invalidation

Edit a template or a source file and Vellum re-renders only the output files affected by the change. A docs project that wires `vellum build --watch` alongside the host's dev server (Next.js, Mintlify, etc.) no longer needs a restart loop to see TSDoc edits.

```sh
vellum build --watch
```

### How invalidation works

Templates are instrumented while rendering. The `symbol()`, `symbols()`, and `module()` globals record what each `.vel` file actually read:

- `symbol(id)` - the looked-up `SymbolId`,
- `module(path)` - the module path,
- `symbols(query)` - the verbatim query *and* the resulting ids.

On a source-file change, Vellum diffs the file's old vs new symbols (source-position-insensitive content hash) and re-renders templates whose recorded reads intersect the diff. Added symbols are re-matched against each template's prior queries so a new `symbols({ tag: 'foo' })` result triggers the right renders.

Template edits re-render only that template. Config changes tear down the watcher and re-prime. Render and extract errors log and keep the previous output on disk - the watcher stays alive.

### API changes (minor - pre-1.0)

**`TemplateEngine.render` returns `RenderResult`**, not `string`. Custom engines update the return shape:

```ts
// before
async render(source, ctx): Promise<string> { ... }

// after
async render(source, ctx): Promise<RenderResult> {
  return { output }
  // or { output, reads } when ctx.reads was supplied
}
```

**`SymbolIndex` gains `symbolsByFile` and `removeByFile`.** Custom index implementations need both. `InMemorySymbolIndex` now tracks per-file provenance via `Symbol.source.file`.

**`matchesQuery(sym, query)`** is exported from `@vellum-docs/core` - the exact predicate `InMemorySymbolIndex.symbols()` uses, reusable by tooling that needs to test a single symbol against a query.

### New exports (`@vellum-docs/core`)

- `TemplateReads`, `createTemplateReads()`
- `SymbolDiff`, `diffSymbols`, `hashSymbol`, `mergeDiffs`, `emptyDiff`, `isEmptyDiff`
- `DependencyGraph`
- `Vellum.extractLanguage`, `Vellum.renderTemplate`, `Vellum.listTemplates`

### New exports (`@vellum-docs/cli`)

- `runWatch`, `WatchCommandOptions`

### Watcher details

File watching uses [chokidar](https://github.com/paulmillr/chokidar) v4 with Nuxt-style granular filtering: `node_modules`, `.git`, `.turbo`, `dist`, `build`, `coverage`, and the resolved `outDir` are ignored anywhere in the tree, even if a user's `sources[lang].include` would otherwise cover them. Events are debounced 100ms; `awaitWriteFinish` handles editor save races.

### Known tradeoff

Per-file TS extraction isn't meaningful in isolation (cross-file type graph), so `extractLanguage` re-runs the extractor over the whole program on each batch. Invalidation still narrows the *render* set - which is what dominates latency for a typical docs project - but we don't yet skip extraction for unchanged files beyond the existing content-hash cache.
