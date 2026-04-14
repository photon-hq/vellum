import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Extractor tests build real `ts.Program`s; under v8 coverage on CI they
    // routinely push past the 5s default. 30s is generous and applies
    // uniformly instead of scattering per-test overrides.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/index.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
