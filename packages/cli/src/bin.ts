#!/usr/bin/env node
import process from 'node:process'
import { runBuild } from './build'

const args = process.argv.slice(2)
const command = args[0]

function parseFlag(name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1)
    return undefined
  return args[i + 1]
}

function hasFlag(name: string): boolean {
  return args.includes(name)
}

function printHelp(): void {
  console.log(`vellum — documentation preprocessor

Usage:
  vellum build [--config <path>] [--cwd <path>] [--no-strict]
  vellum help

Commands:
  build    Extract symbols and render .vel templates to the output directory.
  help     Show this help.

Flags:
  --config <path>   Config file path (default: auto-discover vellum.config.{ts,mts,js,mjs}).
  --cwd <path>      Working directory (default: process.cwd()).
  --no-strict       Disable strict template rendering. By default, a template
                    that references an undefined field (typos, missing symbols)
                    fails the build. Pass --no-strict to fall back to silent
                    empty output — useful only during migration.
`)
}

async function main(): Promise<void> {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }
  if (command === 'build') {
    const cwd = parseFlag('--cwd') ?? process.cwd()
    const configPath = parseFlag('--config')
    const strict = !hasFlag('--no-strict')
    await runBuild({ cwd, configPath, strict })
    return
  }
  console.error(`vellum: unknown command: ${command}`)
  printHelp()
  process.exit(1)
}

main().catch((err) => {
  console.error('vellum: build failed')
  console.error(err)
  process.exit(1)
})
