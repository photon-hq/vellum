import { createConsola } from 'consola'

/**
 * Shared tagged consola instance for the CLI. All user-facing output
 * should flow through this - keeps formatting, levels, and colors
 * consistent across commands.
 */
export const logger = createConsola({
  defaults: {
    tag: 'vellum',
  },
})
