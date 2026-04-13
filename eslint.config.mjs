import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  markdown: false,
  ignores: [
    '**/dist/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/.turbo/**',
    'examples/**/docs/**',
    'examples/**/app/docs/reference/**',
    '**/*.vel',
    'test/fixtures/**',
  ],
})
