import type { Symbol } from '@vellum-docs/core'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

describe('typeStringFrom — oneline', () => {
  const extractor = new TypeScriptExtractor()
  let symbols: Symbol[]

  beforeAll(async () => {
    symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'multiline-types.ts')],
      root: FIXTURES,
      config: undefined,
    })
  })

  it('populates oneline on multi-line union type aliases', () => {
    const dir = symbols.find(s => s.name === 'Dir')!
    expect(dir.aliasOf).toBeDefined()
    expect(dir.aliasOf!.text).toContain('\n')
    expect(dir.aliasOf!.oneline).toBeDefined()
    expect(dir.aliasOf!.oneline).toBe('| \'north\' | \'south\' | \'east\' | \'west\'')
  })

  it('omits oneline when text is already single-line', () => {
    const flag = symbols.find(s => s.name === 'Flag')!
    expect(flag.aliasOf).toBeDefined()
    expect(flag.aliasOf!.text).not.toContain('\n')
    expect(flag.aliasOf!.oneline).toBeUndefined()
  })
})
