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
  kind: 'property' | 'method' | 'constructor' | 'index' | 'call'
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
  signatureResolved?: string
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
