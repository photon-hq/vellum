import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures')
const FAKEPKG = resolve(FIXTURES, 'fakepkg/index.d.ts')

describe('TypeScriptExtractor — package extraction', () => {
  const extractor = new TypeScriptExtractor()

  it('extracts symbols from .d.ts barrel files via module exports', async () => {
    const symbols = await extractor.extract({
      files: [],
      root: FIXTURES,
      config: undefined,
      packageFiles: [{ file: FAKEPKG, packageName: 'fakepkg' }],
    })

    expect(symbols.length).toBeGreaterThanOrEqual(2)

    const widget = symbols.find(s => s.name === 'Widget')
    expect(widget).toBeDefined()
    expect(widget!.kind).toBe('interface')
    expect(widget!.module).toBe('fakepkg')
    expect(widget!.id).toBe('ts:fakepkg#Widget')
    expect(widget!.exported).toBe(true)
  })

  it('follows re-exports to find declarations in internal files', async () => {
    const symbols = await extractor.extract({
      files: [],
      root: FIXTURES,
      config: undefined,
      packageFiles: [{ file: FAKEPKG, packageName: 'fakepkg' }],
    })

    const createWidget = symbols.find(s => s.name === 'createWidget')
    expect(createWidget).toBeDefined()
    expect(createWidget!.kind).toBe('function')
    expect(createWidget!.module).toBe('fakepkg')
    expect(createWidget!.exported).toBe(true)
  })

  it('extracts TSDoc from .d.ts declarations', async () => {
    const symbols = await extractor.extract({
      files: [],
      root: FIXTURES,
      config: undefined,
      packageFiles: [{ file: FAKEPKG, packageName: 'fakepkg' }],
    })

    const widget = symbols.find(s => s.name === 'Widget')!
    expect(widget.doc.summary).toBe('A widget from the fake package.')

    const members = widget.members!
    expect(members.find(m => m.name === 'id')!.doc.summary).toBe('Widget identifier.')
  })

  it('extracts both project files and package files in one pass', async () => {
    const symbols = await extractor.extract({
      files: [resolve(FIXTURES, 'sample/types.ts')],
      root: FIXTURES,
      config: undefined,
      packageFiles: [{ file: FAKEPKG, packageName: 'fakepkg' }],
    })

    // Project symbols
    expect(symbols.find(s => s.name === 'User')).toBeDefined()
    // Package symbols
    expect(symbols.find(s => s.name === 'Widget')).toBeDefined()

    // Different modules
    expect(symbols.find(s => s.name === 'User')!.module).toBe('sample/types.ts')
    expect(symbols.find(s => s.name === 'Widget')!.module).toBe('fakepkg')
  })
})
