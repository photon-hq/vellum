/** Canonical string-tagged union with per-arm fields. */
export type GroupChange =
  | { readonly type: 'renamed', readonly name: string }
  | { readonly type: 'participantAdded', readonly address: string }
  | { readonly type: 'iconRemoved' }

/** Numeric discriminator. */
export type Code =
  | { readonly code: 200, readonly body: string }
  | { readonly code: 404 }

/** Generic union - variant fields carry type parameters. */
export type Result<T, E> =
  | { readonly ok: true, readonly value: T }
  | { readonly ok: false, readonly error: E }

/** Named-reference arms - out of scope, should fall through to kind=type. */
export interface Foo { kind: 'foo', n: number }
export interface Bar { kind: 'bar', s: string }
export type FooBar = Foo | Bar

/** Mixed union - primitive arm should invalidate detection. */
export type Mixed = string | { readonly type: 'obj' }

/** No shared discriminator - no common property name. */
export type NoDisc = { a: string } | { b: number }

/**
 * Two candidate discriminators. `tag` has 2 distinct values, `other` has 1.
 * `tag` should win.
 */
export type MultiKey =
  | { tag: 'x', other: 'same' }
  | { tag: 'y', other: 'same' }
