import { mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TypeScriptExtractor } from '../../extractor-typescript/src'
import { NunjucksEngine } from '../../engine-nunjucks/src'
import { MarkdownProfile } from '../../profile-markdown/src'
import { InMemoryCache, Vellum } from '../src'
import type { VellumConfig } from '../src'

const RESOLVE_ROOT = resolve(__dirname, '../../../test/fixtures/resolve-test')
const PACKAGES_DIR = join(RESOLVE_ROOT, 'packages')
const NODE_MODULES = join(RESOLVE_ROOT, 'node_modules')

// Create node_modules symlinks from the committed packages/ fixtures
// before tests, remove after.
beforeAll(() => {
  mkdirSync(join(NODE_MODULES, '@types'), { recursive: true })
  symlinkSync(join(PACKAGES_DIR, 'strat2-pkg'), join(NODE_MODULES, 'strat2-pkg'), 'dir')
  symlinkSync(join(PACKAGES_DIR, 'strat3-pkg'), join(NODE_MODULES, 'strat3-pkg'), 'dir')
  symlinkSync(join(PACKAGES_DIR, '@types/strat4-pkg'), join(NODE_MODULES, '@types/strat4-pkg'), 'dir')
})

afterAll(() => {
  rmSync(NODE_MODULES, { recursive: true, force: true })
})

function makeConfig(overrides: Partial<VellumConfig>): VellumConfig {
  return {
    root: RESOLVE_ROOT,
    sources: { ts: { include: [] } },
    templates: '.',
    outDir: RESOLVE_ROOT,
    extractors: [new TypeScriptExtractor()],
    engine: new NunjucksEngine(),
    profile: new MarkdownProfile(),
    cache: new InMemoryCache(),
    ...overrides,
  }
}

describe('package resolution strategies', () => {
  it('strategy 1: reads types from node_modules on disk (bypass exports)', async () => {
    const vellum = new Vellum(makeConfig({
      sources: { ts: { include: [], packages: ['strat2-pkg'] } },
    }))

    await vellum.extractAll()
    const sym = vellum.index.symbol('ts:strat2-pkg#Strat2Type')
    expect(sym).not.toBeNull()
    expect(sym!.kind).toBe('interface')
  })

  it('strategy 3: resolves co-located .d.ts from .js main', async () => {
    const vellum = new Vellum(makeConfig({
      sources: { ts: { include: [], packages: ['strat3-pkg'] } },
    }))

    await vellum.extractAll()
    const sym = vellum.index.symbol('ts:strat3-pkg#Strat3Type')
    expect(sym).not.toBeNull()
    expect(sym!.kind).toBe('interface')
  })

  it('strategy 4: falls back to @types/ package', async () => {
    const vellum = new Vellum(makeConfig({
      sources: { ts: { include: [], packages: ['strat4-pkg'] } },
    }))

    await vellum.extractAll()
    const sym = vellum.index.symbol('ts:strat4-pkg#Strat4Type')
    expect(sym).not.toBeNull()
    expect(sym!.kind).toBe('interface')
  })

  it('warns when package cannot be resolved', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const vellum = new Vellum(makeConfig({
      sources: { ts: { include: [], packages: ['nonexistent-package-xyz'] } },
    }))

    await vellum.extractAll()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent-package-xyz'),
    )

    warnSpy.mockRestore()
  })
})

describe('resolveFiles — recursive directory walking', () => {
  it('walks nested directories to find .ts files', async () => {
    const vellum = new Vellum(makeConfig({
      sources: { ts: { include: ['nested'] } },
    }))

    await vellum.extractAll()
    const names = vellum.index.all().map(s => s.name).sort()
    expect(names).toContain('A')
    expect(names).toContain('B')
  })

  it('resolves individual file paths in include', async () => {
    const vellum = new Vellum(makeConfig({
      sources: { ts: { include: ['nested/a.ts'] } },
    }))

    await vellum.extractAll()
    const allSyms = vellum.index.all()
    expect(allSyms).toHaveLength(1)
    expect(allSyms[0]!.name).toBe('A')
  })

  it('skips node_modules inside walked directories', async () => {
    const vellum = new Vellum(makeConfig({
      sources: { ts: { include: ['.'] } },
    }))

    await vellum.extractAll()
    const names = vellum.index.all().map(s => s.name)
    expect(names).toContain('A')
    expect(names).toContain('B')
    // node_modules should be skipped by the walker
    expect(names).not.toContain('Strat2Type')
    expect(names).not.toContain('Strat3Type')
  })
})
