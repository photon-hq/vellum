import type { Symbol } from '@vellum-docs/core'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

describe('typeScriptExtractor — as-const-enum pattern', () => {
  const extractor = new TypeScriptExtractor()
  let symbols: Symbol[]

  beforeAll(async () => {
    symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'as-const-enum.ts')],
      root: FIXTURES,
      config: undefined,
    })
  })

  it('promotes a string `as const` object to kind=enum with variants', () => {
    const me = symbols.find(s => s.name === 'MessageEffect')
    expect(me).toBeDefined()
    expect(me!.kind).toBe('enum')
    expect(me!.variants).toBeDefined()
    expect(me!.variants!.map(v => v.name)).toEqual(['slam', 'loud', 'confetti'])

    const slam = me!.variants!.find(v => v.name === 'slam')!
    expect(slam.value!.kind).toBe('string')
    expect(slam.value!.value).toBe('com.apple.MobileSMS.expressivesend.impact')
    expect(slam.doc.summary).toBe('A slam effect.')
  })

  it('promotes a numeric `as const` object', () => {
    const code = symbols.find(s => s.name === 'Code')
    expect(code!.kind).toBe('enum')
    const ok = code!.variants!.find(v => v.name === 'Ok')!
    expect(ok.value!.kind).toBe('number')
    expect(ok.value!.value).toBe(200)
  })

  it('keeps `signature` as the source form (kind drives render, signature is truth)', () => {
    const me = symbols.find(s => s.name === 'MessageEffect')!
    expect(me.signature.startsWith('const MessageEffect')).toBe(true)
  })

  it('suppresses the self-referential `type X = (typeof X)[keyof typeof X]` sibling', () => {
    const dupes = symbols.filter(s => s.name === 'MessageEffect')
    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.kind).toBe('enum')

    const codeDupes = symbols.filter(s => s.name === 'Code')
    expect(codeDupes).toHaveLength(1)
  })

  it('does NOT promote a plain const object (values widen to primitives)', () => {
    const config = symbols.find(s => s.name === 'CONFIG')!
    expect(config.kind).toBe('const')
    expect(config.variants).toBeUndefined()
  })

  it('does NOT promote when any property value is non-literal', () => {
    const mixed = symbols.find(s => s.name === 'MIXED')!
    expect(mixed.kind).toBe('const')
    expect(mixed.variants).toBeUndefined()
  })
})
