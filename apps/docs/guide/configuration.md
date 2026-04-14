# Configuration

Vellum reads `vellum.config.{ts,mts,js,mjs}` from the working
directory (or the path passed to `--config`). Loaded via `jiti` — no
build step required.

## Minimal config

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
  templates: 'docs-src',
  outDir: 'docs',
  extractors: [new TypeScriptExtractor()],
  engine: new NunjucksEngine(),
  profile: new MarkdownProfile(),
} satisfies VellumConfig
```

## Fields

### `root: string`

Project root. Used as the base for all relative paths. Typically
`import.meta.dirname`.

### `sources: Record<string, { include: string[]; packages?: string[] }>`

Per-language source configuration. The key is the extractor's
`language` identifier (`"ts"`, `"py"`, etc.).

- `include` — paths (files or directories) to extract from. Directories
  are walked recursively; `node_modules` is skipped.
- `packages` — npm package specifiers to document. See
  [Package extraction](/guide/package-extraction).

### `templates: string`

Directory containing your `.md.vel` (or `.mdx.vel`, `.html.vel`, etc.)
templates. Walked recursively.

### `outDir: string`

Where rendered output is written. Mirrored directory structure — a
template at `templates/reference/api.md.vel` lands at
`outDir/reference/api.md`. You should `.gitignore` this directory.

### `extractors: Extractor[]`

Language extractors to run. Each implements the `Extractor`
interface — `language`, `extensions`, `extract()`. Multi-language
projects list multiple extractors.

### `engine: TemplateEngine`

The template engine. Only shipping implementation is
`NunjucksEngine`, but the interface is open.

### `profile: RendererProfile`

Target-host-aware rendering. Swapping this changes what `{{ sym | signature }}`
emits without touching any template. Ships with
[`MarkdownProfile`](/reference/profiles#markdownprofile) and
[`MintlifyProfile`](/reference/profiles#mintlifyprofile); write
your own by implementing `RendererProfile`.

### `cache?: Cache`

Custom cache implementation. Defaults to `DiskCache` at
`node_modules/.cache/vellum/`. Pass `InMemoryCache` (from core) for
CI or test environments.

## Engine options

`NunjucksEngine` accepts options for extension:

```ts
new NunjucksEngine({
  strict: true,                       // default — fail on undefined
  searchPaths: ['docs-src/_partials'], // extra {% include %} roots
  globals: { env: process.env },       // extra template globals
  filters: { myFilter: (s) => ... },  // extra template filters
})
```

See [CLI → Strict rendering](/reference/cli#strict-template-rendering-default)
for the `strict` option's semantics and the `--no-strict` escape hatch.

## Config file resolution

`vellum build` looks for:

1. `vellum.config.ts`
2. `vellum.config.mts`
3. `vellum.config.js`
4. `vellum.config.mjs`

…in that order, starting from `--cwd` (default: `process.cwd()`).
Use `--config <path>` to override.
