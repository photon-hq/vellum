export type SymbolId = string

export type SymbolKind
  = | 'function'
    | 'method'
    | 'constructor'
    | 'class'
    | 'interface'
    | 'type'
    | 'enum'
    | 'namespace'
    | 'module'
    | 'const'
    | 'variable'
    | 'property'
    | 'parameter'
    | 'typeParameter'
    | 'unknown'

export interface SourceLocation {
  file: string
  line: number
  column: number
  endLine: number
  endColumn: number
}

export interface TypeRef {
  start: number
  end: number
  symbolId: SymbolId
}

export interface TypeString {
  text: string
  /**
   * Single-line form suitable for table cells, tooltips, and inline
   * annotations where `text` (which may be pretty-printed across several
   * lines for pretty-printed unions) would break the surrounding syntax.
   * Optional — extractors may omit when it would equal `text`.
   */
  oneline?: string
  refs: TypeRef[]
}

export interface Literal {
  kind:
    | 'string'
    | 'number'
    | 'boolean'
    | 'bigint'
    | 'null'
    | 'undefined'
    | 'object'
    | 'array'
    | 'expression'
  text: string
  value?: string | number | boolean
}

export interface Example {
  title: string | null
  lang: string
  code: string
  description: string | null
}

export interface DocComment {
  raw: string
  summary: string
  description: string
  params: Record<string, string>
  returns: string | null
  examples: Example[]
  throws: { type: TypeString, description: string }[]
  see: string[]
  deprecated: { reason: string } | null
  since: string | null
  customTags: Record<string, string[]>
}

export interface Parameter {
  name: string
  type: TypeString
  optional: boolean
  rest: boolean
  defaultValue: Literal | null
  doc: string
}

export interface TypeParameter {
  name: string
  constraint: TypeString | null
  default: TypeString | null
}

export interface Signature {
  parameters: Parameter[]
  returnType: TypeString
  typeParameters: TypeParameter[]
  doc: DocComment
}

export interface Member {
  name: string
  kind: 'property' | 'method' | 'constructor'
  signature: string
  type: TypeString
  optional: boolean
  readonly: boolean
  visibility: 'public' | 'protected' | 'private'
  static: boolean
  doc: DocComment
}

export interface EnumVariant {
  name: string
  value: Literal | null
  doc: DocComment
  /**
   * Per-variant payload fields. Populated when a variant carries data —
   * TS discriminated-union arms, Rust/Swift/Kotlin enum variants with
   * associated values, etc. Absent for flat enums and `as const` objects
   * whose entries are scalar.
   */
  fields?: Member[]
}

export interface Symbol {
  id: SymbolId
  name: string
  kind: SymbolKind
  language: string

  module: string
  source: SourceLocation
  visibility: 'public' | 'protected' | 'private' | 'internal'
  exported: boolean

  signature: string
  typeRefs: TypeRef[]

  doc: DocComment
  tags: string[]

  parameters?: Parameter[]
  signatures?: Signature[]
  returnType?: TypeString

  typeParameters?: TypeParameter[]

  members?: Member[]
  extends?: TypeString[]
  implements?: TypeString[]
  aliasOf?: TypeString

  valueType?: TypeString
  value?: Literal | null
  mutable?: boolean

  variants?: EnumVariant[]
  /**
   * For tagged-union shapes whose variants are identified by a shared
   * property name (e.g. TS `{ type: 'a' } | { type: 'b' }`, discriminator
   * = `'type'`). Unset for languages where the variant name is itself
   * the discriminator (Rust/Swift/Kotlin enum).
   */
  discriminator?: string

  extra?: Record<string, unknown>
}

export interface Module {
  path: string
  exports: Symbol[]
}

export function emptyDocComment(): DocComment {
  return {
    raw: '',
    summary: '',
    description: '',
    params: {},
    returns: null,
    examples: [],
    throws: [],
    see: [],
    deprecated: null,
    since: null,
    customTags: {},
  }
}
