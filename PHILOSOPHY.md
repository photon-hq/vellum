# Vellum — Philosophy

This document exists because [ARCHITECTURE.md](ARCHITECTURE.md) describes
*how* Vellum is built and [README.md](README.md) describes *what* it does,
but neither explains *why* the choices go the way they do. When a new
question arrives — "should feature X use shape A or shape B?" — the
answer is usually in here, not there.

---

## The central tension

There are two ways to write API docs. They pull against each other:

- **Curated docs** (hand-written Markdown). You decide what matters, in
  what order, with what narrative. The result is something developers
  actually want to read. The failure mode is drift: a type gets a new
  field, a signature changes, and unless someone updates the docs in the
  same PR, the reference goes quietly stale.

- **Auto-generated docs** (TypeDoc, Rustdoc, JSDoc). Always accurate
  because they read source directly. The failure mode is a wall of
  alphabetically-sorted API surface with no sense of what matters, and
  customization means fighting the tool's theme system.

**Vellum picks both.** Authors write curated docs and *pull* live data
from source into their narrative. When the code changes the docs update
— no copy-paste, no drift. The output is plain MDX/Markdown/HTML;
whatever host the project already uses renders it directly.

Everything below follows from wanting both at once.

---

## Principles

### 1. Shape over syntax

The schema describes what a symbol *means to a reader*, not how it was
spelled in source.

TypeScript's `enum`, `as const` objects (`const X = {...} as const`), and
discriminated unions (`type X = {type:'a'} | {type:'b'}`) are three
different pieces of source-level syntax. From the reader's perspective
they are the same thing: a closed set of named variants, possibly with
per-variant payload. All three promote to `kind: 'enum'` with populated
`variants[]`. One template renders all three.

This is the move that makes cross-language extraction feasible. A Rust
`enum Shape { Circle { r: f64 }, Rect { w, h } }`, a Swift `enum` with
associated values, and a Kotlin `sealed class` hierarchy are all the
same shape. Whichever extractor ships next populates the same enriched
`EnumVariant` (tag + fields) without any schema additions.

The cost: `sym.kind` no longer matches a source keyword exactly. The
fidelity you lose is recoverable through `sym.signature`, which stays
faithful to source (canonical printer output). `kind` is how templates
choose a render; `signature` is what readers see.

### 2. Language-agnostic by restraint

The symbol schema is small, flat, and language-neutral. It doesn't
model a type system.

Types are stored as `{ text: string; refs: TypeRef[] }` — a string plus
byte-range pointers to other symbols. Not a recursive `UnionType |
IntersectionType | ReferenceType | ...` tree. A structured type tree
works for one language and undermines every other extractor.

String + refs round-trips through any language: stringify types the way
that language normally displays them, mark the spans that link
elsewhere, done. Python's `list[int]`, Rust's `Vec<i32>`, TypeScript's
`Array<number>` — all produced by the same shape.

The schema is deliberately lossy. `extra: Record<string, unknown>`
exists as the escape hatch when a language needs to surface something
the core shape can't express.

**On "language-agnostic" vs. "pattern-aware."** The bar isn't "no
field can be more common in one language than another." It's "every
field serves a cross-language *pattern*, not a single-language
idiosyncrasy." `Symbol.discriminator?` is an example: it names the
discriminator property of a tagged-union arm, a concept TS makes
explicit and Rust/Swift/Kotlin fold into the variant name itself. The
field is *used* by TS and unused by native sum-type languages, but the
pattern it describes — "what tells variants apart" — is universal.
That's fine. What's *not* fine is a field that only means something
under one language's semantics (e.g., `isAsync`, `isGenerator`,
`isRefCounted`) — those belong in `extra`.

### 3. Pull, don't push

Authors write the document; Vellum supplies primitives.

There is no "reference theme" component to configure. Authors write a
`.mdx.vel` template — a plain file — that uses `symbol(id)` to pull
live data into the narrative they wrote. Built-in partials are
provided as starting points and authors copy-and-edit them rather than
wait for upstream to expose a prop.

The surface is small on purpose: three globals (`symbol`, `symbols`,
`module`), a dozen filters, a handful of partials. If it's not in that
list it's a `{% for %}` loop or a copied partial.

This makes Vellum the opposite of an autogenerator in one important
way: if your docs look bad, it's because *your template looks bad*, not
because a theme is fighting you.

### 4. Templates should feel like prose with holes

Vellum uses Nunjucks (Jinja-family syntax) rather than a bespoke engine.
A custom template language costs months and doesn't differentiate a
docs tool. Authors who've used Jinja, Liquid, Twig, or Django already
know most of the syntax. Those who haven't can skim one reference
page and start writing.

The surface is narrow on purpose — three globals, a dozen filters, a
few partials. An author can fit the whole API in their head and
revisit a template a month later without re-reading docs.

Flexibility lives in the *data*, not in the template language. One
pattern renders the same shape across every source language:

```njk
{% for v in sym.variants %}
| `{{ v.name }}` | `{{ v.value.text }}` | {{ v.doc.summary }} |
{% endfor %}
```

That loop already handles a TS `enum`, a TS `as const` object, a TS
discriminated union, and — when the extractors ship — a Rust `enum`
with associated values, a Swift `enum`, a Kotlin `sealed class`. One
authoring pattern, many source forms.

When a template gets complicated, the fix is almost never a new
template feature. It's usually "make the extractor emit data already
shaped for the loop" — push the complexity down into the data layer,
not up into the template. The template language stays small so the
data layer does the work.

Writing a Vellum template should feel close to writing prose with
small holes for live values, not programming around a template
engine's rough edges. If adding a feature makes the average template
*longer* or *harder to skim*, it's probably the wrong feature.

### 5. Data first, rendering second

Two layers, deliberately separated:

- **Extractors** produce `Symbol[]`. Language-aware, rendering-unaware.
- **Profiles** turn `Symbol`s into markup. Rendering-aware,
  language-unaware.

Filters are the seam. `{{ sym | signature }}` goes through the active
profile, so the same template emits different markup against
`MarkdownProfile` and `MintlifyProfile`. Swap the profile and the host
changes without touching a single template line.

Profile-routed filters are named for the *operation*, not the target
format. `signature`, not `mdxSignature`. `link`, not `mdxLink`. The
name doesn't leak that you happen to be emitting MDX today.

### 6. Strict detection, opaque fall-through

When extractors recognize a shape (as-const enum, discriminated union,
property-with-literal-type) they promote it. When they can't recognize
it with confidence, they *leave it alone*. The raw form is always
still there.

The `as const` detector requires every property to have a literal
type. The discriminated-union detector requires every arm to be an
inline object type and a shared literal-typed discriminator. One
non-literal member, one named-reference arm, one mixed union with a
primitive — detection fails, the symbol keeps its source `kind`, and
the template renders via the fall-through path.

The philosophy: **never interpret a symbol in a way the author didn't
intend.** Ambiguous → opaque. Templates can always work from `aliasOf`
/ `signature` directly even when structured promotion doesn't fire.

### 7. The 80% case defines the schema

When we're adding a field, we check: does this serve most users, or
only the one in front of us?

- `variants` covers real enums, `as const` objects, TS discriminated
  unions, and (future) Rust/Swift/Kotlin native enums. One primitive,
  four source forms.
- `cell` filter takes `TypeString | string | null`. Same filter for
  types, summaries, literals, anything cell-bound.
- `declaration` filter is a one-liner alias for `sym.signature` —
  discoverable name, zero new semantics.

New fields get added when the existing shape genuinely can't stretch.
`EnumVariant.fields?` was added because Rust enum variants carry
payload and TS discriminated-union arms carry payload, and no existing
field captured either. `TypeString.oneline?` was added because cell
rendering needs it and `text` can't be both source-faithful and
single-line.

The anti-pattern: a field that only ever fires for one language's
idiosyncratic pattern. That goes in `extra`.

### 8. Be faithful where it matters

Shape-over-syntax doesn't license sloppiness at the symbol level.

`Symbol.signature` is canonical TypeScript — run through
`ts.createPrinter` with bodies stripped, equivalent to `tsc
--declaration` output. If a reader copies the code block from docs
into their editor, it had better look like something `tsc` would
accept.

The cross-language-friendly shape rules (principle 1) apply to how we
*categorize* symbols. The per-symbol text output stays honest.

Where we deliberately diverge from tsc — keeping `private cleanup():
void;` instead of tsc's `private cleanup;` erasure — it's because our
audience (docs readers) is better served by seeing the signature than
by matching a compiler optimization that makes sense in `.d.ts` but
not in docs. The divergence is named and tested, not accidental.

### 9. Plain output; zero runtime

Vellum produces plain MDX / Markdown / HTML. No injected components.
No runtime JavaScript the host has to wire up. No framework coupling.

If Mintlify adds a new component tomorrow, a profile can emit it. If
Docusaurus replaces Mintlify in a project next year, swap the profile
— no template rewrites, no new build step, no runtime drift.

This is also why generated output is `.gitignore`d and built in CI.
The output is a pure function of source + config; committing it
creates two sources of truth and an inevitable drift. Failures fail
loudly at build time, exactly when someone can fix them.

### 10. Primitives over themes

Vellum ships globals, filters, and partials. It does not ship a "docs
theme" you configure with 40 options and extend through a plugin
protocol.

Partials are intentionally copy-editable. If the function-signature
layout doesn't fit your project, copy `@vellum-docs/partials/function-
signature.njk` into your project and edit it. Don't file an issue
asking for a `hideReturnType` prop.

The price: each project ends up with its own partials. The
benefit: each project's docs actually fit its shape, and Vellum
doesn't accumulate the barnacles that come from pleasing every caller.

### 11. Fail loudly at build time

Broken symbol refs, missing files, extractor errors — all surface in
CI. The preprocessor is a pure function of source and config, and
failures must fail loudly so they get fixed the same day they land.

This is why SymbolIds are stable across runs and *intentionally* fail
when symbols are renamed. A stale ID silently pointing at the wrong
thing is worse than a broken ID that breaks the build.

---

## What Vellum is *not*

Explicitly out of scope, and likely to stay so:

- **Not a runtime library.** The output is static files. No injected
  components, no runtime JS, no hydration.

- **Not a type-system model.** The symbol schema doesn't represent
  types structurally — no `UnionType | IntersectionType` recursion.
  Deep type queries are not a goal; if you need them, the `extra`
  field is the escape hatch.

- **Not a theme.** Vellum has no opinion about what your docs look
  like. It provides primitives. What you compose them into is yours.

- **Not an auto-generator.** `vellum build` doesn't sweep your source
  tree and emit a docs site. It renders *templates you wrote* against
  extracted data. If you didn't reference a symbol, it doesn't appear.

- **Not a replacement for Markdown/MDX.** Vellum preprocesses. The
  host (Mintlify, Docusaurus, plain static hosting) still does the
  rendering. Vellum compiles `.mdx.vel` → `.mdx` and steps away.

---

## The durable bets

If you're adding a feature, a field, or a filter, these are the
commitments that bend last:

1. **The symbol schema is language-agnostic.** Every field must make
   sense for Rust and Python, not just TypeScript. If it can't, it
   belongs in `extra` or an extractor-specific detail.

2. **Detection is strict; fall-through stays opaque.** We never
   interpret a symbol in a way the author didn't write. When unsure,
   emit the raw form and let templates decide.

3. **`kind` describes shape. `signature` describes source.** Those two
   fields cover the readers-vs-type-system tension. They split the
   work cleanly; new features should pick one side and stay there.

4. **The output is plain files.** The day Vellum needs a runtime
   component to make something work is the day that feature is wrong.

5. **Authors are in control.** If a choice takes flexibility away from
   template authors, the choice is wrong. Primitives over themes,
   copy-editable partials over sealed components, always.

6. **Complexity moves down, not up.** When something is hard to
   express in a template, the fix is a richer extractor or a new
   field, not a new template-engine feature. The template layer
   stays small on purpose — that's where authors live.
