import { relative, resolve } from 'node:path'
import process from 'node:process'

import { Vellum } from '@vellum-docs/core'

import { findConfig, loadConfig } from './config'
import { logger } from './logger'

export interface BuildCommandOptions {
  cwd: string
  configPath?: string
  /**
   * When `false`, overrides the engine's default strict mode - undefined
   * template expressions render as empty instead of failing the build.
   * The config file's engine settings are authoritative unless this is
   * explicitly set.
   */
  strict?: boolean
}

export async function runBuild(opts: BuildCommandOptions): Promise<void> {
  const cwd = resolve(opts.cwd)
  const configPath = opts.configPath
    ? resolve(cwd, opts.configPath)
    : findConfig(cwd)

  if (!configPath) {
    logger.error(
      `no config file found. Looked for vellum.config.{ts,mts,js,mjs} in ${cwd}`,
    )
    process.exit(1)
  }

  const config = await loadConfig(configPath)
  if (!config.root)
    config.root = cwd

  // CLI flag override: if the engine has a mutable `strict` property
  // (NunjucksEngine does), honor the flag. Keeps the CLI out of
  // engine-implementation details but still lets `--no-strict` work.
  if (opts.strict === false && 'strict' in config.engine)
    (config.engine as { strict: boolean }).strict = false

  const vellum = new Vellum(config)

  const start = Date.now()
  const result = await vellum.build()
  const duration = Date.now() - start

  logger.success(
    `extracted ${result.symbolsExtracted} symbols, rendered ${result.templatesRendered} templates in ${duration}ms`,
  )
  for (const f of result.filesWritten) {
    logger.log(`  → ${relative(cwd, f)}`)
  }
}
