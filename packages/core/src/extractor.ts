import type { Symbol } from "./types.js";

export interface ExtractInput {
  files: string[];
  root: string;
  config: unknown;
}

export interface Extractor {
  readonly language: string;
  readonly extensions: readonly string[];
  extract(input: ExtractInput): Promise<Symbol[]>;
}
