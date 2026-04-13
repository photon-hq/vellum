import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findConfig } from '../src/config'

describe('findConfig', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vellum-cli-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('finds vellum.config.ts', () => {
    writeFileSync(join(tempDir, 'vellum.config.ts'), 'export default {}')
    expect(findConfig(tempDir)).toBe(join(tempDir, 'vellum.config.ts'))
  })

  it('finds vellum.config.mts', () => {
    writeFileSync(join(tempDir, 'vellum.config.mts'), 'export default {}')
    expect(findConfig(tempDir)).toBe(join(tempDir, 'vellum.config.mts'))
  })

  it('finds vellum.config.js', () => {
    writeFileSync(join(tempDir, 'vellum.config.js'), 'module.exports = {}')
    expect(findConfig(tempDir)).toBe(join(tempDir, 'vellum.config.js'))
  })

  it('finds vellum.config.mjs', () => {
    writeFileSync(join(tempDir, 'vellum.config.mjs'), 'export default {}')
    expect(findConfig(tempDir)).toBe(join(tempDir, 'vellum.config.mjs'))
  })

  it('prefers .ts over .js', () => {
    writeFileSync(join(tempDir, 'vellum.config.ts'), 'export default {}')
    writeFileSync(join(tempDir, 'vellum.config.js'), 'module.exports = {}')
    expect(findConfig(tempDir)).toBe(join(tempDir, 'vellum.config.ts'))
  })

  it('returns null when no config exists', () => {
    expect(findConfig(tempDir)).toBeNull()
  })
})
