import type { Symbol } from '@vellum-docs/core'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures')
const FAKEPKG = resolve(FIXTURES, 'fakepkg/index.d.ts')

describe('typeScriptExtractor - package extraction', () => {
  const extractor = new TypeScriptExtractor()
  let symbols: Symbol[]

  beforeAll(async () => {
    symbols = await extractor.extract({
      files: [],
      root: FIXTURES,
      config: undefined,
      packageFiles: [{ file: FAKEPKG, packageName: 'fakepkg' }],
    })
  })

  it('extracts symbols from .d.ts barrel files via module exports', () => {
    expect(symbols.length).toBeGreaterThanOrEqual(2)

    const widget = symbols.find(s => s.name === 'Widget')
    expect(widget).toBeDefined()
    expect(widget!.kind).toBe('interface')
    expect(widget!.module).toBe('fakepkg')
    expect(widget!.id).toBe('ts:fakepkg#Widget')
    expect(widget!.exported).toBe(true)
  })

  it('follows re-exports to find declarations in internal files', () => {
    const createWidget = symbols.find(s => s.name === 'createWidget')
    expect(createWidget).toBeDefined()
    expect(createWidget!.kind).toBe('function')
    expect(createWidget!.module).toBe('fakepkg')
    expect(createWidget!.exported).toBe(true)
  })

  it('extracts TSDoc from .d.ts declarations', () => {
    const widget = symbols.find(s => s.name === 'Widget')!
    expect(widget.doc.summary).toBe('A widget from the fake package.')

    const members = widget.members!
    expect(members.find(m => m.name === 'id')!.doc.summary).toBe('Widget identifier.')
  })

  it('extracts both project files and package files in one pass', async () => {
    // Separate extraction - this variant includes project files that the
    // shared `symbols` snapshot does not.
    const combined = await extractor.extract({
      files: [resolve(FIXTURES, 'sample/types.ts')],
      root: FIXTURES,
      config: undefined,
      packageFiles: [{ file: FAKEPKG, packageName: 'fakepkg' }],
    })

    expect(combined.find(s => s.name === 'User')).toBeDefined()
    expect(combined.find(s => s.name === 'Widget')).toBeDefined()
    expect(combined.find(s => s.name === 'User')!.module).toBe('sample/types.ts')
    expect(combined.find(s => s.name === 'Widget')!.module).toBe('fakepkg')
  })
})
