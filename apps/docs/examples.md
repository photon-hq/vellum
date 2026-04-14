# Examples

Working setups in the `examples/` directory.

## `examples/basic`

Minimal setup. Three `.md.vel` templates render types, constants, and
API functions into plain `.mdx`/`.md` files that any static host can
render.

```sh
cd examples/basic
pnpm build            # runs: vellum build
cat docs/types.mdx    # generated output
```

[→ source on GitHub](https://github.com/photon-hq/vellum/tree/master/examples/basic)

## `examples/nextjs`

Full Next.js App Router integration. Vellum outputs `page.mdx` files
directly into `app/docs/reference/*/`, so Next.js serves them via
file-system routing with zero runtime lookup.

```sh
cd examples/nextjs
pnpm docs:build       # runs: vellum build
pnpm dev              # runs: vellum build && next dev
```

Pages generated:

- `/docs/reference/types` — all interfaces and type aliases
- `/docs/reference/constants` — constant table with name, value, description
- `/docs/reference/api` — function signatures with params, returns, examples

[→ source on GitHub](https://github.com/photon-hq/vellum/tree/master/examples/nextjs)

## This site

`apps/docs/` — the site you're reading now. Uses VitePress + Vellum
with dogfooded reference pages (schema, profiles, extractors) that
extract from Vellum's own source.

[→ source on GitHub](https://github.com/photon-hq/vellum/tree/master/apps/docs)
