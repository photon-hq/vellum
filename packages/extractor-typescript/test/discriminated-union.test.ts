import type { Symbol } from '@vellum-docs/core'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

describe('typeScriptExtractor - discriminated unions', () => {
  const extractor = new TypeScriptExtractor()
  let symbols: Symbol[]

  beforeAll(async () => {
    symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'discriminated-union.ts')],
      root: FIXTURES,
      config: undefined,
    })
  })

  it('promotes GroupChange to kind=enum with discriminator + variants', () => {
    const gc = symbols.find(s => s.name === 'GroupChange')!
    expect(gc.kind).toBe('enum')
    expect(gc.discriminator).toBe('type')
    expect(gc.variants!.map(v => v.name)).toEqual([
      'renamed',
      'participantAdded',
      'iconRemoved',
    ])
  })

  it('carries per-variant fields (discriminator stripped)', () => {
    const gc = symbols.find(s => s.name === 'GroupChange')!
    const renamed = gc.variants!.find(v => v.name === 'renamed')!
    expect(renamed.fields).toBeDefined()
    expect(renamed.fields!.map(f => f.name)).toEqual(['name'])
    expect(renamed.fields![0]!.type.text).toBe('string')
    expect(renamed.fields![0]!.readonly).toBe(true)

    const iconRemoved = gc.variants!.find(v => v.name === 'iconRemoved')!
    expect(iconRemoved.fields).toBeUndefined()
  })

  it('carries the discriminator value on each variant', () => {
    const gc = symbols.find(s => s.name === 'GroupChange')!
    const v = gc.variants!.find(sv => sv.name === 'renamed')!
    expect(v.value!.kind).toBe('string')
    expect(v.value!.value).toBe('renamed')
  })

  it('supports numeric discriminators', () => {
    const code = symbols.find(s => s.name === 'Code')!
    expect(code.kind).toBe('enum')
    expect(code.discriminator).toBe('code')
    const ok = code.variants!.find(v => v.name === '200')!
    expect(ok.value!.kind).toBe('number')
    expect(ok.value!.value).toBe(200)
    expect(ok.fields!.map(f => f.name)).toEqual(['body'])
  })

  it('supports generic unions - field types carry type parameters', () => {
    const result = symbols.find(s => s.name === 'Result')!
    expect(result.kind).toBe('enum')
    expect(result.discriminator).toBe('ok')
    expect(result.typeParameters!.map(tp => tp.name)).toEqual(['T', 'E'])

    const okArm = result.variants!.find(v => v.name === 'true')!
    expect(okArm.fields![0]!.name).toBe('value')
    expect(okArm.fields![0]!.type.text).toBe('T')

    const errArm = result.variants!.find(v => v.name === 'false')!
    expect(errArm.fields![0]!.name).toBe('error')
    expect(errArm.fields![0]!.type.text).toBe('E')
  })

  it('picks the discriminator with the most distinct values (ties → first)', () => {
    const mk = symbols.find(s => s.name === 'MultiKey')!
    expect(mk.kind).toBe('enum')
    expect(mk.discriminator).toBe('tag')
  })

  it('keeps aliasOf populated on promoted unions (backward compat)', () => {
    const gc = symbols.find(s => s.name === 'GroupChange')!
    expect(gc.aliasOf).toBeDefined()
    expect(gc.aliasOf!.text).toContain('renamed')
  })

  it('falls through for named-reference arms', () => {
    const fb = symbols.find(s => s.name === 'FooBar')!
    expect(fb.kind).toBe('type')
    expect(fb.variants).toBeUndefined()
    expect(fb.discriminator).toBeUndefined()
    expect(fb.aliasOf!.text).toContain('Foo')
  })

  it('falls through for unions mixing primitives and objects', () => {
    const m = symbols.find(s => s.name === 'Mixed')!
    expect(m.kind).toBe('type')
    expect(m.variants).toBeUndefined()
  })

  it('falls through when arms share no property name', () => {
    const nd = symbols.find(s => s.name === 'NoDisc')!
    expect(nd.kind).toBe('type')
    expect(nd.variants).toBeUndefined()
  })
})
