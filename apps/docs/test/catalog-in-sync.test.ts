import type { TemplateContext } from '@vellum-docs/core'
/**
 * Guards the hand-authored `reference/globals.md` and
 * `reference/filters.md` pages against drift: every filter/global
 * exposed by the runtime engine must have a section heading on the
 * doc page, and every documented entry must exist at runtime.
 *
 * Companion to the canonical-signature contract test - same idea
 * (compare documented claims against the code) applied to docs
 * completeness.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InMemorySymbolIndex } from '@vellum-docs/core'
import { buildFilters, buildGlobals } from '@vellum-docs/engine-nunjucks'
import { MarkdownProfile } from '@vellum-docs/profile-markdown'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const docsDir = resolve(here, '..')

function ctx(): TemplateContext {
  return {
    index: new InMemorySymbolIndex(),
    profile: new MarkdownProfile(),
    sourceFile: 'probe.vel',
  }
}

/** Pull inline-code headings at the given level: `### \`name\`` → `name`. */
function codeHeadings(path: string, level: number): string[] {
  const content = readFileSync(path, 'utf8')
  const prefix = `${'#'.repeat(level)} `
  const names: string[] = []
  for (const raw of content.split('\n')) {
    if (!raw.startsWith(prefix))
      continue
    const rest = raw.slice(prefix.length).trim()
    const m = rest.match(/^`([^`]+)`$/)
    if (m)
      names.push(m[1]!)
  }
  return names
}

describe('docs catalog stays in sync with engine surface', () => {
  const registeredFilters = new Set(Object.keys(buildFilters(ctx())))
  const registeredGlobals = new Set(Object.keys(buildGlobals(ctx())))

  it('every registered filter has a section in reference/filters.md', () => {
    const documented = new Set(codeHeadings(resolve(docsDir, 'reference/filters.md'), 3))
    for (const name of registeredFilters) {
      expect(documented.has(name), `filter "${name}" registered but not documented`).toBe(true)
    }
  })

  it('every documented filter in reference/filters.md exists at runtime', () => {
    const documented = codeHeadings(resolve(docsDir, 'reference/filters.md'), 3)
    for (const name of documented) {
      expect(registeredFilters.has(name), `filter "${name}" documented but not registered`).toBe(true)
    }
  })

  it('every registered global has a section in reference/globals.md', () => {
    const content = readFileSync(resolve(docsDir, 'reference/globals.md'), 'utf8')
    for (const name of registeredGlobals) {
      // Globals are headed as `## \`name(<sig>)\`` - just check the name token.
      expect(
        content.includes(`## \`${name}(`),
        `global "${name}" registered but not documented`,
      ).toBe(true)
    }
  })
})
