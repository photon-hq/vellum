import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

import type { Cache } from "./cache.js";
import { InMemoryCache } from "./cache.js";
import type { TemplateEngine } from "./engine.js";
import type { Extractor, PackageFile } from "./extractor.js";
import type { RendererProfile } from "./profile.js";
import type { SymbolIndex } from "./symbol-index.js";
import { InMemorySymbolIndex } from "./symbol-index.js";

export interface VellumConfig {
  /** Project root — all other paths are resolved against this. */
  root: string;

  /** Source roots to extract symbols from, per language. Paths relative to root. */
  sources: Record<string, {
    include: string[];
    /**
     * npm packages to extract types from. Each entry is a package specifier
     * (e.g. "next/font", "@tanstack/react-query"). Vellum resolves the
     * package's `.d.ts` entry point and extracts exported symbols from it.
     *
     * Symbols from packages use the package specifier as their module path
     * in SymbolIds, e.g. `ts:next/font#NextFont`.
     */
    packages?: string[];
  }>;

  /** Template source directory (contains .vel files). Relative to root. */
  templates: string;

  /** Output directory for generated files. Relative to root. */
  outDir: string;

  extractors: Extractor[];
  engine: TemplateEngine;
  profile: RendererProfile;

  index?: SymbolIndex;
  cache?: Cache;

  /** Per-extractor config passthrough. */
  extractorConfig?: Record<string, unknown>;
}

export interface BuildResult {
  templatesRendered: number;
  symbolsExtracted: number;
  filesWritten: string[];
}

const hashFile = async (path: string): Promise<string> => {
  const buf = await readFile(path);
  return createHash("sha1").update(buf).digest("hex");
};

export class Vellum {
  readonly config: VellumConfig;
  readonly index: SymbolIndex;
  readonly cache: Cache;

  constructor(config: VellumConfig) {
    this.config = config;
    this.index = config.index ?? new InMemorySymbolIndex();
    this.cache = config.cache ?? new InMemoryCache();
  }

  async extractAll(): Promise<number> {
    const root = resolve(this.config.root);
    let count = 0;

    for (const extractor of this.config.extractors) {
      const langConfig = this.config.sources[extractor.language];
      if (!langConfig) continue;

      const files = await this.resolveFiles(root, langConfig.include, extractor.extensions);

      // Resolve package specifiers to their .d.ts entry points.
      const packageFiles = this.resolvePackages(root, langConfig.packages ?? [], extractor.extensions);

      const fresh: string[] = [];
      const cachedSymbols: import("./types.js").Symbol[] = [];

      for (const file of files) {
        const hash = await hashFile(file);
        const entry = await this.cache.get({
          language: extractor.language,
          file,
          hash,
        });
        if (entry) {
          cachedSymbols.push(...entry.symbols);
        } else {
          fresh.push(file);
        }
      }

      let extracted: import("./types.js").Symbol[] = [];
      const hasWork = fresh.length > 0 || packageFiles.length > 0;
      if (hasWork) {
        extracted = await extractor.extract({
          files: fresh,
          root,
          config: this.config.extractorConfig?.[extractor.language],
          packageFiles: packageFiles.length > 0 ? packageFiles : undefined,
        });

        // Re-bin extracted symbols back into per-file cache entries.
        const byFile = new Map<string, import("./types.js").Symbol[]>();
        for (const s of extracted) {
          const abs = resolve(root, s.source.file);
          const list = byFile.get(abs) ?? [];
          list.push(s);
          byFile.set(abs, list);
        }
        for (const file of fresh) {
          const hash = await hashFile(file);
          await this.cache.set({
            key: { language: extractor.language, file, hash },
            symbols: byFile.get(file) ?? [],
          });
        }
      }

      const all = [...cachedSymbols, ...extracted];
      this.index.add(all);
      count += all.length;
    }

    return count;
  }

  async renderTemplates(): Promise<string[]> {
    const root = resolve(this.config.root);
    const templateRoot = resolve(root, this.config.templates);
    const outRoot = resolve(root, this.config.outDir);

    const ext = this.config.engine.sourceExtension;
    const files = await this.walkFiles(templateRoot, (name) => name.endsWith(ext));
    const written: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const output = await this.config.engine.render(source, {
        index: this.index,
        profile: this.config.profile,
        sourceFile: file,
      });

      const rel = relative(templateRoot, file);
      // strip trailing ".vel" from e.g. "foo.mdx.vel" → "foo.mdx"
      const outRel = rel.slice(0, -ext.length);
      const outPath = join(outRoot, outRel);

      await mkdir(dirname(outPath), { recursive: true });
      const finalOutput = this.config.profile.postProcess
        ? this.config.profile.postProcess(output)
        : output;
      await writeFile(outPath, finalOutput, "utf8");
      written.push(outPath);
    }

    return written;
  }

  async build(): Promise<BuildResult> {
    const symbolsExtracted = await this.extractAll();
    const filesWritten = await this.renderTemplates();
    return {
      symbolsExtracted,
      templatesRendered: filesWritten.length,
      filesWritten,
    };
  }

  private resolvePackages(
    root: string,
    packages: string[],
    _extensions: readonly string[],
  ): PackageFile[] {
    if (packages.length === 0) return [];
    const require = createRequire(resolve(root, "package.json"));
    const results: PackageFile[] = [];

    for (const pkg of packages) {
      try {
        // Try resolving as a types entry: package/index.d.ts or @types/package
        const resolved = this.resolvePackageTypes(require, pkg);
        if (resolved) {
          results.push({ file: resolved, packageName: pkg });
        }
      } catch {
        // Silently skip unresolvable packages — the user might not have
        // installed them yet. A future `vellum check` command would catch this.
      }
    }
    return results;
  }

  /**
   * Try to find the .d.ts entry point for a package. Resolution order:
   * 1. require.resolve("pkg/package.json") → read `types`/`typings` field
   * 2. require.resolve("pkg") with .d.ts extensions
   * 3. require.resolve("@types/pkg") as fallback
   */
  private resolvePackageTypes(req: NodeRequire, pkg: string): string | null {
    // Strategy 1: read the package's own package.json for types/typings field.
    try {
      const pkgJsonPath = req.resolve(`${pkg}/package.json`);
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      const typesField: string | undefined =
        pkgJson.types ?? pkgJson.typings ?? pkgJson.exports?.["."]?.types;
      if (typesField) {
        return resolve(dirname(pkgJsonPath), typesField);
      }
    } catch {
      // no package.json — try other strategies
    }

    // Strategy 2: try resolving the package directly — works when main is a .d.ts.
    try {
      const resolved = req.resolve(pkg);
      if (resolved.endsWith(".d.ts") || resolved.endsWith(".d.mts") || resolved.endsWith(".d.cts")) {
        return resolved;
      }
      // The main might be .js — look for a co-located .d.ts
      const dtsPath = resolved.replace(/\.(js|mjs|cjs)$/, ".d.ts");
      if (existsSync(dtsPath)) return dtsPath;
    } catch {
      // not resolvable
    }

    // Strategy 3: @types/pkg fallback.
    try {
      const atTypes = `@types/${pkg.startsWith("@") ? pkg.slice(1).replace("/", "__") : pkg}`;
      return req.resolve(atTypes);
    } catch {
      // no @types either
    }

    return null;
  }

  private async resolveFiles(
    root: string,
    include: string[],
    extensions: readonly string[],
  ): Promise<string[]> {
    const results = new Set<string>();
    for (const pattern of include) {
      const base = resolve(root, pattern);
      let s;
      try {
        s = await stat(base);
      } catch {
        continue;
      }
      if (s.isFile()) {
        if (extensions.some((e) => base.endsWith(e))) results.add(base);
      } else if (s.isDirectory()) {
        const files = await this.walkFiles(base, (name) =>
          extensions.some((e) => name.endsWith(e)),
        );
        for (const f of files) results.add(f);
      }
    }
    return Array.from(results).sort();
  }

  private async walkFiles(root: string, match: (name: string) => boolean): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    const results: string[] = [];

    const visit = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(full);
        } else if (entry.isFile() && match(entry.name)) {
          results.push(full);
        }
      }
    };

    try {
      const s = await stat(root);
      if (s.isDirectory()) await visit(root);
    } catch {
      // missing directory — empty result
    }
    return results.sort();
  }
}

export { extname };
