import type { Symbol } from '@vellum-docs/core'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

describe('typeScriptExtractor — variables', () => {
  const extractor = new TypeScriptExtractor()
  let symbols: Symbol[]

  beforeAll(async () => {
    symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'variables.ts')],
      root: FIXTURES,
      config: undefined,
    })
  })

  it('extracts let as mutable variable', () => {
    const counter = symbols.find(s => s.name === 'counter')
    expect(counter).toBeDefined()
    expect(counter!.kind).toBe('variable')
    expect(counter!.mutable).toBe(true)
  })

  it('extracts const without annotation using inferred type', () => {
    const inferred = symbols.find(s => s.name === 'inferred')
    expect(inferred).toBeDefined()
    expect(inferred!.kind).toBe('const')
    expect(inferred!.mutable).toBe(false)
    expect(inferred!.valueType).toBeDefined()
    expect(inferred!.valueType!.text.length).toBeGreaterThan(0)
  })

  it('extracts const with explicit type annotation', () => {
    const typed = symbols.find(s => s.name === 'typed')
    expect(typed).toBeDefined()
    expect(typed!.valueType!.text).toBe('number')
  })

  it('parses literal kinds correctly', () => {
    expect(symbols.find(s => s.name === 'FLAG')!.value!.kind).toBe('boolean')
    expect(symbols.find(s => s.name === 'EMPTY')!.value!.kind).toBe('null')
    expect(symbols.find(s => s.name === 'LIST')!.value!.kind).toBe('array')
    expect(symbols.find(s => s.name === 'CONFIG')!.value!.kind).toBe('object')
    expect(symbols.find(s => s.name === 'BIG')!.value!.kind).toBe('number')
  })
})
