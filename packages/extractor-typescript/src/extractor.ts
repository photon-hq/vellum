import ts from "typescript";

import type { Extractor, ExtractInput, Symbol as VSymbol } from "@vellum-docs/core";

import { collectNames, extractFromFile } from "./walk.js";

export interface TypeScriptExtractorOptions {
  /** Compiler options applied to the in-memory Program. */
  compilerOptions?: ts.CompilerOptions;
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
};

export class TypeScriptExtractor implements Extractor {
  readonly language = "ts";
  readonly extensions = [".ts", ".tsx", ".mts", ".cts"] as const;

  private readonly options: TypeScriptExtractorOptions;

  constructor(options: TypeScriptExtractorOptions = {}) {
    this.options = options;
  }

  async extract(input: ExtractInput): Promise<VSymbol[]> {
    if (input.files.length === 0) return [];

    const compilerOptions: ts.CompilerOptions = {
      ...defaultCompilerOptions,
      ...this.options.compilerOptions,
    };

    const program = ts.createProgram({
      rootNames: input.files,
      options: compilerOptions,
    });
    const checker = program.getTypeChecker();

    // First pass: collect names across all files for cross-ref resolution.
    const allNames = new Map<string, string>();
    for (const file of input.files) {
      const sf = program.getSourceFile(file);
      if (!sf || sf.isDeclarationFile) continue;
      const names = collectNames(sf, input.root);
      for (const [k, v] of names) allNames.set(k, v);
    }

    // Second pass: extract symbols.
    const results: VSymbol[] = [];
    for (const file of input.files) {
      const sf = program.getSourceFile(file);
      if (!sf || sf.isDeclarationFile) continue;
      const symbols = extractFromFile(sf, checker, input.root, allNames);
      results.push(...symbols);
    }

    return results;
  }
}
