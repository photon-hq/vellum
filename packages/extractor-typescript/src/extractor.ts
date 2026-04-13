import type { ExtractInput, Extractor, Symbol as VSymbol } from '@vellum-docs/core'

import { realpathSync } from 'node:fs'
import ts from 'typescript'

import { collectNames, extractFromFile } from './walk'

export interface TypeScriptExtractorOptions {
  /** Compiler options applied to the in-memory Program. */
  compilerOptions?: ts.CompilerOptions
}

const defaultCompilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  strict: false,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  allowImportingTsExtensions: false,
  declaration: false,
}

export class TypeScriptExtractor implements Extractor {
  readonly language = 'ts'
  readonly extensions = ['.ts', '.tsx', '.mts', '.cts'] as const

  private readonly options: TypeScriptExtractorOptions

  constructor(options: TypeScriptExtractorOptions = {}) {
    this.options = options
  }

  async extract(input: ExtractInput): Promise<VSymbol[]> {
    const packageFiles = input.packageFiles ?? []
    const allRootNames = [
      ...input.files,
      ...packageFiles.map(pf => pf.file),
    ]
    if (allRootNames.length === 0)
      return []

    const compilerOptions: ts.CompilerOptions = {
      ...defaultCompilerOptions,
      ...this.options.compilerOptions,
    }

    const program = ts.createProgram({
      rootNames: allRootNames,
      options: compilerOptions,
    })
    const checker = program.getTypeChecker()

    // Build a map of resolved file path → package name for package files.
    const packageModuleMap = new Map<string, string>()
    for (const pf of packageFiles) {
      packageModuleMap.set(pf.file, pf.packageName)
    }

    // First pass: collect names across all files for cross-ref resolution.
    const allNames = new Map<string, string>()
    for (const rootName of allRootNames) {
      let sf = program.getSourceFile(rootName)
      if (!sf) {
        try {
          sf = program.getSourceFile(realpathSync(rootName))
        }
        catch {}
      }
      if (!sf)
        continue
      const moduleOverride = packageModuleMap.get(rootName)
      const names = collectNames(sf, input.root, moduleOverride)
      for (const [k, v] of names) allNames.set(k, v)
    }

    // Second pass: extract symbols.
    const results: VSymbol[] = []

    // Project files — skip .d.ts (those are ambient, not user-authored).
    for (const file of input.files) {
      const sf = program.getSourceFile(file)
      if (!sf || sf.isDeclarationFile)
        continue
      const symbols = extractFromFile(sf, checker, input.root, allNames)
      results.push(...symbols)
    }

    // Package .d.ts files — these ARE declaration files, extract them.
    // Use realpathSync because pnpm symlinks workspace packages and the
    // TS compiler resolves symlinks internally, so getSourceFile() with
    // the symlink path may return undefined.
    for (const pf of packageFiles) {
      let sf = program.getSourceFile(pf.file)
      if (!sf) {
        try {
          sf = program.getSourceFile(realpathSync(pf.file))
        }
        catch {}
      }
      if (!sf)
        continue
      const symbols = extractFromFile(sf, checker, input.root, allNames, pf.packageName)
      results.push(...symbols)
    }

    return results
  }
}
