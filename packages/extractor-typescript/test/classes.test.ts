import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

describe('typeScriptExtractor — classes', () => {
  const extractor = new TypeScriptExtractor()

  it('extracts classes with members', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'classes.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const base = symbols.find(s => s.name === 'BaseService')
    expect(base).toBeDefined()
    expect(base!.kind).toBe('class')
    expect(base!.exported).toBe(true)
    expect(base!.doc.summary).toBe('Base service class.')
  })

  it('extracts class members with visibility', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'classes.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const base = symbols.find(s => s.name === 'BaseService')!
    expect(base.members).toBeDefined()

    const name = base.members!.find(m => m.name === 'name')
    expect(name).toBeDefined()
    expect(name!.kind).toBe('property')
    expect(name!.readonly).toBe(true)
    expect(name!.doc.summary).toBe('Service name.')

    const start = base.members!.find(m => m.name === 'start')
    expect(start).toBeDefined()
    expect(start!.kind).toBe('method')
    expect(start!.visibility).toBe('public')

    const stop = base.members!.find(m => m.name === 'stop')
    expect(stop).toBeDefined()
    expect(stop!.visibility).toBe('protected')

    const cleanup = base.members!.find(m => m.name === 'cleanup')
    expect(cleanup).toBeDefined()
    expect(cleanup!.visibility).toBe('private')
  })

  it('extracts static members', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'classes.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const base = symbols.find(s => s.name === 'BaseService')!
    const create = base.members!.find(m => m.name === 'create')
    expect(create).toBeDefined()
    expect(create!.static).toBe(true)
  })

  it('extracts constructors', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'classes.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const base = symbols.find(s => s.name === 'BaseService')!
    const ctor = base.members!.find(m => m.kind === 'constructor')
    expect(ctor).toBeDefined()
    expect(ctor!.signature).toContain('name: string')
  })

  it('extracts class inheritance', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'classes.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const extended = symbols.find(s => s.name === 'ExtendedService')
    expect(extended).toBeDefined()
    expect(extended!.signature).toContain('extends BaseService')
  })

  it('marks non-exported classes as not exported', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'classes.ts')],
      root: FIXTURES,
      config: undefined,
    })

    const internal = symbols.find(s => s.name === '_InternalHelper')
    expect(internal).toBeDefined()
    expect(internal!.exported).toBe(false)
  })
})
