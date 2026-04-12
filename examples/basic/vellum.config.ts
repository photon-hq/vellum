import type { VellumConfig } from '@vellum-docs/core'
import { NunjucksEngine } from '@vellum-docs/engine-nunjucks'
import { TypeScriptExtractor } from '@vellum-docs/extractor-typescript'
import { MarkdownProfile } from '@vellum-docs/profile-markdown'

const config: VellumConfig = {
  root: new URL('.', import.meta.url).pathname,
  sources: {
    ts: { include: ['src'], packages: ['@microsoft/tsdoc'] },
  },
  templates: 'docs-src',
  outDir: 'docs',
  extractors: [new TypeScriptExtractor()],
  engine: new NunjucksEngine(),
  profile: new MarkdownProfile(),
}

export default config
