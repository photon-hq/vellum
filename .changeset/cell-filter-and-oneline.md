---
"@vellum-docs/core": patch
"@vellum-docs/extractor-typescript": patch
"@vellum-docs/engine-nunjucks": patch
"@vellum-docs/profile-markdown": patch
"@vellum-docs/profile-mintlify": patch
"@vellum-docs/language-server": patch
---

Add `cell` filter + `TypeString.oneline` for cell-safe rendering

Every adopter was hand-rolling the same 5-filter escape chain when dropping types or summaries into markdown table cells:

```njk
{{ m.type.text | replace("\n"," ") | replace("    ","") | replace("|","\\|") | replace("<","&lt;") | replace(">","&gt;") }}
```

Two additions collapse that:

**`TypeString.oneline?: string`** - populated at extraction time with the whitespace-collapsed form of `text`. Omitted when equal to `text` (single-line case). Fixes the `\n` + indentation problem at source, before any template filter runs.

**`cell` filter** (profile-routed) - accepts a `TypeString`, plain string, or null. Collapses whitespace as defence-in-depth, routes through the profile's new `cell(value, ctx)` method, which wraps in a code span and escapes `|`. Works for anything cell-bound, not just types.

Before:

```njk
| `{{ m.name }}` | `{{ m.type.text | replace("\n"," ") | replace("    ","") | replace("|","\\|") | replace("<","&lt;") | replace(">","&gt;") }}` | {{ m.doc.summary }} |
```

After:

```njk
| `{{ m.name }}` | {{ m.type | cell | safe }} | {{ m.doc.summary | cell | safe }} |
```

### Schema additions (additive)

- `TypeString.oneline?: string`
- `RendererProfile.cell(value: string, ctx: RenderContext): string`

Existing extractors keep working - when `oneline` is absent the filter falls back to `.text`. Existing profiles get the new method implemented in `MarkdownProfile` and `MintlifyProfile`; third-party profiles must add a `cell` implementation.

### Out of scope

`jsx-prop` and `fenced` contexts from the original request. Neither has recurring template pain today; defer until they do.
