#!/usr/bin/env node
import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import { runBuild } from './build'
import { logger } from './logger'
import { runWatch } from './watch'

const buildCommand = defineCommand({
  meta: {
    name: 'build',
    description: 'Extract symbols and render .vel templates to the output directory.',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config file (default: auto-discover vellum.config.{ts,mts,js,mjs}).',
    },
    cwd: {
      type: 'string',
      description: 'Working directory.',
      default: process.cwd(),
    },
    watch: {
      type: 'boolean',
      description:
        'Watch source files, templates, and config. On change, re-extract '
        + 'affected symbols and re-render only the templates whose recorded '
        + 'reads touched the change.',
      default: false,
    },
    strict: {
      type: 'boolean',
      description:
        'Fail the build when a template outputs an undefined value. '
        + 'Pass --no-strict to fall back to silent empty output '
        + '(useful only during migration).',
      default: true,
    },
  },
  async run({ args }) {
    if (args.watch) {
      await runWatch({ cwd: args.cwd, configPath: args.config, strict: args.strict })
      return
    }
    await runBuild({ cwd: args.cwd, configPath: args.config, strict: args.strict })
  },
})

const main = defineCommand({
  meta: {
    name: 'vellum',
    description: 'A build-time documentation preprocessor.',
  },
  subCommands: {
    build: buildCommand,
  },
})

runMain(main).catch((err) => {
  logger.error('command failed')
  logger.error(err)
  process.exit(1)
})
