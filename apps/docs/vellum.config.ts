import type { VellumConfig } from '@vellum-docs/core'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NunjucksEngine } from '@vellum-docs/engine-nunjucks'
import { TypeScriptExtractor } from '@vellum-docs/extractor-typescript'
import { MarkdownProfile } from '@vellum-docs/profile-markdown'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

export default {
  root: repoRoot,
  sources: {
    ts: {
      include: [
        resolve(repoRoot, 'packages/core/src/types.ts'),
        resolve(repoRoot, 'packages/core/src/profile.ts'),
        resolve(repoRoot, 'packages/core/src/engine.ts'),
        resolve(repoRoot, 'packages/core/src/extractor.ts'),
        resolve(repoRoot, 'packages/core/src/vellum.ts'),
        resolve(repoRoot, 'packages/extractor-typescript/src/index.ts'),
      ],
    },
  },
  templates: here,
  outDir: here,
  extractors: [new TypeScriptExtractor()],
  engine: new NunjucksEngine(),
  profile: new MarkdownProfile(),
} satisfies VellumConfig
