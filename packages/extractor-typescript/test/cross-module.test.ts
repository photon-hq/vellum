import type { Symbol } from '@vellum-docs/core'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/cross-module')

describe('typeScriptExtractor — cross-module knownNames', () => {
  const extractor = new TypeScriptExtractor()
  let symbols: Symbol[]

  beforeAll(async () => {
    symbols = await extractor.extract({
      files: [
        resolve(FIXTURES, 'models.ts'),
        resolve(FIXTURES, 'api.ts'),
        resolve(FIXTURES, 'other.ts'),
      ],
      root: FIXTURES,
      config: undefined,
    })
  })

  it('does not resolve ambiguous cross-module typeRef', () => {
    const getUser = symbols.find(s => s.name === 'getUser')
    expect(getUser).toBeDefined()
    expect(getUser!.returnType).toBeDefined()
    expect(getUser!.returnType!.text).toContain('User')

    // "User" is defined in both models.ts and other.ts — the resolution is
    // intentionally ambiguous, so no ref is produced (prevents random linkage).
    const userRef = getUser!.returnType!.refs.find(r => r.symbolId.includes('#User'))
    expect(userRef).toBeUndefined()
  })

  it('resolves same-module typeRef for identically-named symbol', () => {
    const getOther = symbols.find(s => s.name === 'getOtherUser')
    expect(getOther).toBeDefined()
    expect(getOther!.returnType).toBeDefined()

    // The return type references "User" — should link to other.ts#User
    // (same module), not models.ts#User.
    const userRef = getOther!.returnType!.refs.find(r => r.symbolId.includes('#User'))
    expect(userRef).toBeDefined()
    expect(userRef!.symbolId).toBe('ts:other.ts#User')
  })

  it('extracts both User symbols without collision', () => {
    const users = symbols.filter(s => s.name === 'User')
    expect(users).toHaveLength(2)

    const modules = new Set(users.map(s => s.module))
    expect(modules.has('models.ts')).toBe(true)
    expect(modules.has('other.ts')).toBe(true)
  })
})
