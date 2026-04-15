import type { Symbol } from '@vellum-docs/core'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

describe('typeScriptExtractor — export { X } detection', () => {
  const extractor = new TypeScriptExtractor()
  let symbols: Symbol[]

  beforeAll(async () => {
    symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'reexports.ts')],
      root: FIXTURES,
      config: undefined,
    })
  })

  it('marks symbols re-exported via export { X } as exported', () => {
    const config = symbols.find(s => s.name === 'Config')
    expect(config).toBeDefined()
    expect(config!.exported).toBe(true)
  })

  it('marks symbols re-exported via export { X as Y } as exported', () => {
    // The aliased export references Config by its original name
    const config = symbols.find(s => s.name === 'Config')
    expect(config).toBeDefined()
    expect(config!.exported).toBe(true)
  })

  it('marks symbols re-exported via export default X as exported', () => {
    const runner = symbols.find(s => s.name === 'AppRunner')
    expect(runner).toBeDefined()
    expect(runner!.exported).toBe(true)
  })

  it('does not mark non-exported symbols as exported', () => {
    const secret = symbols.find(s => s.name === 'Secret')
    expect(secret).toBeDefined()
    expect(secret!.exported).toBe(false)
  })

  it('classifies compound expression as expression, not string literal', () => {
    const greeting = symbols.find(s => s.name === 'GREETING')
    expect(greeting).toBeDefined()
    expect(greeting!.value).toBeDefined()
    expect(greeting!.value!.kind).toBe('expression')
  })
})
