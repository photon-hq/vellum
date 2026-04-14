import type { VellumConfig } from '../src'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NunjucksEngine } from '../../engine-nunjucks/src'
import { TypeScriptExtractor } from '../../extractor-typescript/src'
import { MarkdownProfile } from '../../profile-markdown/src'
import { DiskCache, InMemoryCache, Vellum } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

function makeConfig(overrides: Partial<VellumConfig> & { root: string }): VellumConfig {
  return {
    sources: { ts: { include: ['types.ts'] } },
    templates: '.',
    outDir: overrides.root,
    extractors: [new TypeScriptExtractor()],
    engine: new NunjucksEngine(),
    profile: new MarkdownProfile(),
    ...overrides,
  }
}

describe('vellum orchestrator', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vellum-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('extracts symbols from source files', async () => {
    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      templates: '.',
      outDir: tempDir,
    }))

    const count = await vellum.extractAll()
    expect(count).toBeGreaterThan(0)

    // Verify symbols are in the index
    expect(vellum.index.symbol('ts:types.ts#User')).not.toBeNull()
    expect(vellum.index.symbol('ts:types.ts#MAX_PAGE_SIZE')).not.toBeNull()
  })

  it('renders templates to output directory', async () => {
    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      templates: '.',
      outDir: tempDir,
    }))

    const result = await vellum.build()
    expect(result.symbolsExtracted).toBeGreaterThan(0)
    expect(result.templatesRendered).toBe(1)
    expect(result.filesWritten).toHaveLength(1)

    const outPath = join(tempDir, 'template.mdx')
    expect(existsSync(outPath)).toBe(true)

    const content = readFileSync(outPath, 'utf8')
    expect(content).toContain('# Test')
    expect(content).toContain('## User')
    expect(content).toContain('A sample user.')
    expect(content).toContain('MAX_PAGE_SIZE')
    expect(content).toContain('100')
  })

  it('uses InMemoryCache when explicitly provided', async () => {
    const cache = new InMemoryCache()
    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      outDir: tempDir,
      cache,
    }))

    await vellum.extractAll()
    // InMemoryCache was used - we can verify by checking the instance
    expect(vellum.cache).toBe(cache)
  })

  it('uses DiskCache by default', async () => {
    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      outDir: tempDir,
    }))
    expect(vellum.cache).toBeInstanceOf(DiskCache)
  })

  it('caches extraction results across calls', async () => {
    const cache = new InMemoryCache()
    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      outDir: tempDir,
      cache,
    }))

    const count1 = await vellum.extractAll()
    // Clear the index to verify second call uses cache
    vellum.index.clear()
    const count2 = await vellum.extractAll()

    // Both calls should return the same count
    expect(count1).toBe(count2)
    expect(count1).toBeGreaterThan(0)
  })

  it('resolves files from directories in include', async () => {
    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      sources: { ts: { include: ['.'] } },
      outDir: tempDir,
    }))

    const count = await vellum.extractAll()
    expect(count).toBeGreaterThan(0)
    expect(vellum.index.symbol('ts:types.ts#User')).not.toBeNull()
  })

  it('handles missing include paths gracefully', async () => {
    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      sources: { ts: { include: ['nonexistent/'] } },
      outDir: tempDir,
    }))

    const count = await vellum.extractAll()
    expect(count).toBe(0)
  })

  it('skips extractors with no matching source config', async () => {
    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      sources: { py: { include: ['src'] } },
      outDir: tempDir,
    }))

    const count = await vellum.extractAll()
    expect(count).toBe(0)
  })

  it('applies profile postProcess if defined', async () => {
    const profile = Object.assign(new MarkdownProfile(), {
      postProcess: (output: string) => `<!-- generated -->\n${output}`,
    })

    const vellum = new Vellum(makeConfig({
      root: FIXTURES,
      outDir: tempDir,
      profile,
    }))

    await vellum.build()
    const content = readFileSync(join(tempDir, 'template.mdx'), 'utf8')
    expect(content.startsWith('<!-- generated -->')).toBe(true)
  })
})
