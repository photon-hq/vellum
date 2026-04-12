import type { Symbol } from './types.js'

export interface PackageFile {
  /** Absolute path to the resolved .d.ts file. */
  file: string
  /** The original package specifier, e.g. "next/font" or "@tanstack/react-query". */
  packageName: string
}

export interface ExtractInput {
  files: string[]
  root: string
  config: unknown
  /** .d.ts files from npm packages to extract alongside project sources. */
  packageFiles?: PackageFile[]
}

export interface Extractor {
  readonly language: string
  readonly extensions: readonly string[]
  extract: (input: ExtractInput) => Promise<Symbol[]>
}
