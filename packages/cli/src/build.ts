import { relative, resolve } from 'node:path'
import process from 'node:process'

import { Vellum } from '@vellum-docs/core'

import { findConfig, loadConfig } from './config.js'

export interface BuildCommandOptions {
  cwd: string
  configPath?: string
}

export async function runBuild(opts: BuildCommandOptions): Promise<void> {
  const cwd = resolve(opts.cwd)
  const configPath = opts.configPath
    ? resolve(cwd, opts.configPath)
    : findConfig(cwd)

  if (!configPath) {
    console.error(
      `vellum: no config file found. Looked for vellum.config.{ts,mts,js,mjs} in ${cwd}`,
    )
    process.exit(1)
  }

  const config = await loadConfig(configPath)
  if (!config.root)
    config.root = cwd
  const vellum = new Vellum(config)

  const start = Date.now()
  const result = await vellum.build()
  const duration = Date.now() - start

  console.log(
    `vellum: extracted ${result.symbolsExtracted} symbols, rendered ${result.templatesRendered} templates in ${duration}ms`,
  )
  for (const f of result.filesWritten) {
    console.log(`  → ${relative(cwd, f)}`)
  }
}
