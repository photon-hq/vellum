import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

describe('typeScriptExtractor — variables', () => {
  const extractor = new TypeScriptExtractor()

  it('extracts let as mutable variable', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'variables.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const counter = symbols.find(s => s.name === 'counter')
    expect(counter).toBeDefined()
    expect(counter!.kind).toBe('variable')
    expect(counter!.mutable).toBe(true)
  })

  it('extracts const without annotation using inferred type', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'variables.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const inferred = symbols.find(s => s.name === 'inferred')
    expect(inferred).toBeDefined()
    expect(inferred!.kind).toBe('const')
    expect(inferred!.mutable).toBe(false)
    // Inferred type should be non-empty (from checker)
    expect(inferred!.valueType).toBeDefined()
    expect(inferred!.valueType!.text.length).toBeGreaterThan(0)
  })

  it('extracts const with explicit type annotation', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'variables.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const typed = symbols.find(s => s.name === 'typed')
    expect(typed).toBeDefined()
    expect(typed!.valueType!.text).toBe('number')
  })

  it('parses literal kinds correctly', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'variables.ts')],
      root: FIXTURES,
      config: undefined,
    })

    expect(symbols.find(s => s.name === 'FLAG')!.value!.kind).toBe('boolean')
    expect(symbols.find(s => s.name === 'EMPTY')!.value!.kind).toBe('null')
    expect(symbols.find(s => s.name === 'LIST')!.value!.kind).toBe('array')
    expect(symbols.find(s => s.name === 'CONFIG')!.value!.kind).toBe('object')
    expect(symbols.find(s => s.name === 'BIG')!.value!.kind).toBe('number')
  })
})
