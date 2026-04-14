# CLI

```sh
vellum build [--config <path>] [--cwd <path>] [--no-strict]
vellum help
```

## Commands

### `build`

Run extractors against configured sources, render every `.vel`
template, and write the output to the directory named in
`outDir`. Exits non-zero on any error.

| Flag | Description |
| ---- | ----------- |
| `--config <path>` | Path to config file (default: auto-discover `vellum.config.{ts,mts,js,mjs}` in cwd). |
| `--cwd <path>` | Working directory (default: `process.cwd()`). |
| `--no-strict` | Disable strict template rendering — see below. |

### `help`

Print usage.

## Strict template rendering (default)

Templates run in strict mode by default: any template that outputs an
undefined value (a typo like <span v-pre>`{{ fn.doc.summaryy }}`</span>, a missing field
access, a `symbol("...")` that returns null and is output directly)
**fails the build**.

This is deliberate — see [Fail loudly at build time](/philosophy#_11-fail-loudly-at-build-time).
Shipping docs with blank sections is exactly what Vellum is meant to
prevent.

### Patterns that stay safe

<div v-pre>

````jinja2
{% if sym.members %}...{% endif %}     {# guarding: still works #}
{{ sym.doc.summary }}                  {# empty string is defined #}
{% for m in sym.members or [] %}...{% endfor %}  {# default fallback #}
````

</div>

### Patterns that now fail

<div v-pre>

````jinja2
{{ sym.doc.summaryy }}     {# typo — undefined — fails #}
{{ sym.nonexistent.field }}  {# walks into undefined — fails #}
{% set s = symbol("typoed-id") %}{{ s.name }}  {# null.name — fails #}
````

</div>

These were precisely the bugs strict mode is designed to catch.

## Opting out

Two ways to fall back to silent-empty behavior if strictly needed
during migration:

**CLI flag** — one-off or in CI:

```sh
vellum build --no-strict
```

**Config** — permanent:

```ts
// vellum.config.ts
engine: new NunjucksEngine({ strict: false }),
```

The opt-out paths exist; the strong recommendation is to fix the
template instead.

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | Success. |
| `1` | Config not found, extractor failure, template error, or I/O failure. |

Defined in [`packages/cli/src/`](https://github.com/photon-hq/vellum/tree/master/packages/cli/src).
