---
"@vellum-docs/extractor-typescript": patch
---

Promote `as const` enum pattern to `kind: 'enum'`

The TS extractor now recognizes the `as const` enum pattern and treats it as a real `enum` for docs purposes. Both source forms produce identical `Symbol` output:

```ts
// Plain enum
enum MessageEffect {
  slam = 'com.apple.MobileSMS.expressivesend.impact',
}

// `as const` object — widely recommended over `enum` (TS handbook,
// typescript-eslint's `prefer-literal-enum-member`)
const MessageEffect = {
  slam: 'com.apple.MobileSMS.expressivesend.impact',
} as const
type MessageEffect = (typeof MessageEffect)[keyof typeof MessageEffect]
```

For the second form, the extractor now sets `sym.kind = 'enum'`, populates `sym.variants[]` with one entry per property (each carrying `name`, `value`, and per-property JSDoc), and suppresses the self-referential `type X = (typeof X)[keyof typeof X]` sibling so the symbol appears once.

Detection is strict — all properties must have literal types (string/number/boolean). Regular object constants (`const CONFIG = { timeout: 5000 }`) and mixed-value `as const` objects (with functions, nested objects, etc.) fall through to normal const extraction unchanged.

`sym.signature` stays as the source form (`const X = {...}` / `declare const X: {...}`) — `kind` drives how templates render it, `signature` stays faithful to the source.

Template authors get one renderer that works for both source forms:

```njk
{% for v in sym.variants %}
| `{{ sym.name }}.{{ v.name }}` | `{{ v.value.text }}` | {{ v.doc.summary }} |
{% endfor %}
```
