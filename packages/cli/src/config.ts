import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createJiti } from "jiti";

import type { VellumConfig } from "@vellum-docs/core";

const CONFIG_CANDIDATES = [
  "vellum.config.ts",
  "vellum.config.mts",
  "vellum.config.js",
  "vellum.config.mjs",
];

export const findConfig = (cwd: string): string | null => {
  for (const name of CONFIG_CANDIDATES) {
    const full = resolve(cwd, name);
    if (existsSync(full)) return full;
  }
  return null;
};

export const loadConfig = async (configPath: string): Promise<VellumConfig> => {
  const jiti = createJiti(configPath, {
    interopDefault: true,
    moduleCache: false,
  });
  const mod = await jiti.import<{ default?: VellumConfig } | VellumConfig>(configPath);
  const config = (mod as { default?: VellumConfig }).default ?? (mod as VellumConfig);
  if (!config || typeof config !== "object") {
    throw new Error(`vellum config at ${configPath} did not export a config object`);
  }
  return config;
};
