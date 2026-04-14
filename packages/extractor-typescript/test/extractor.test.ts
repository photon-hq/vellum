import type { Symbol } from '@vellum-docs/core'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

describe('typeScriptExtractor', () => {
  const extractor = new TypeScriptExtractor()
  // Building a ts.Program is expensive (~1–5s). Every assertion below reads
  // the same extracted snapshot, so extract once and share.
  let symbols: Symbol[]

  beforeAll(async () => {
    symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'types.ts')],
      root: FIXTURES,
      config: undefined,
    })
  })

  it('has correct language and extensions', () => {
    expect(extractor.language).toBe('ts')
    expect(extractor.extensions).toContain('.ts')
    expect(extractor.extensions).toContain('.tsx')
  })

  it('extracts interfaces with members', () => {
    const user = symbols.find(s => s.name === 'User')
    expect(user).toBeDefined()
    expect(user!.kind).toBe('interface')
    expect(user!.exported).toBe(true)
    expect(user!.module).toBe('types.ts')
    expect(user!.id).toBe('ts:types.ts#User')

    expect(user!.members).toBeDefined()
    expect(user!.members!.length).toBeGreaterThanOrEqual(3)

    const idMember = user!.members!.find(m => m.name === 'id')
    expect(idMember).toBeDefined()
    expect(idMember!.doc.summary).toBe('Unique identifier.')

    const emailMember = user!.members!.find(m => m.name === 'email')
    expect(emailMember).toBeDefined()
    expect(emailMember!.optional).toBe(true)
  })

  it('extracts type aliases', () => {
    const role = symbols.find(s => s.name === 'Role')
    expect(role).toBeDefined()
    expect(role!.kind).toBe('type')
    expect(role!.aliasOf).toBeDefined()
    expect(role!.aliasOf!.text).toContain('admin')
  })

  it('extracts constants with values', () => {
    const maxPage = symbols.find(s => s.name === 'MAX_PAGE_SIZE')
    expect(maxPage).toBeDefined()
    expect(maxPage!.kind).toBe('const')
    expect(maxPage!.value).toBeDefined()
    expect(maxPage!.value!.text).toBe('100')
    expect(maxPage!.value!.kind).toBe('number')

    const version = symbols.find(s => s.name === 'VERSION')
    expect(version).toBeDefined()
    expect(version!.value!.kind).toBe('string')
  })

  it('extracts functions with parameters and return types', () => {
    const getUser = symbols.find(s => s.name === 'getUser')
    expect(getUser).toBeDefined()
    expect(getUser!.kind).toBe('function')

    expect(getUser!.parameters).toBeDefined()
    expect(getUser!.parameters).toHaveLength(1)
    expect(getUser!.parameters![0]!.name).toBe('id')
    expect(getUser!.parameters![0]!.type.text).toBe('string')
    expect(getUser!.parameters![0]!.doc).toBe('The user id.')

    expect(getUser!.returnType).toBeDefined()
    expect(getUser!.returnType!.text).toContain('User')
  })

  it('extracts enums with variants', () => {
    const status = symbols.find(s => s.name === 'Status')
    expect(status).toBeDefined()
    expect(status!.kind).toBe('enum')
    expect(status!.variants).toBeDefined()
    expect(status!.variants).toHaveLength(2)

    const ok = status!.variants!.find(v => v.name === 'Ok')
    expect(ok).toBeDefined()
    expect(ok!.value!.text).toContain('ok')
    expect(ok!.doc.summary).toBe('Everything is fine.')
  })

  it('extracts TSDoc summary and examples', () => {
    const user = symbols.find(s => s.name === 'User')!
    expect(user.doc.summary).toBe('A sample user.')
    expect(user.doc.examples).toHaveLength(1)
    expect(user.doc.examples[0]!.lang).toBe('ts')
    expect(user.doc.examples[0]!.code).toContain('const u: User')
  })

  it('extracts all expected symbols from fixture', () => {
    const names = symbols.map(s => s.name).sort()
    expect(names).toEqual(['MAX_PAGE_SIZE', 'Role', 'Status', 'User', 'VERSION', 'getUser'])
  })

  it('returns empty array for empty input', async () => {
    const empty = await extractor.extract({
      files: [],
      root: FIXTURES,
      config: undefined,
    })
    expect(empty).toEqual([])
  })

  it('builds cross-file typeRefs via knownNames', () => {
    const getUser = symbols.find(s => s.name === 'getUser')!
    expect(getUser.returnType).toBeDefined()
    expect(getUser.returnType!.text).toContain('User')
    expect(getUser.returnType!.refs.length).toBeGreaterThanOrEqual(1)
    expect(getUser.returnType!.refs[0]!.symbolId).toBe('ts:types.ts#User')
  })
})
