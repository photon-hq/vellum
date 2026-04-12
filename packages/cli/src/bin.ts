#!/usr/bin/env node
import { runBuild } from "./build.js";

const args = process.argv.slice(2);
const command = args[0];

const parseFlag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
};

const printHelp = (): void => {
  console.log(`vellum — documentation preprocessor

Usage:
  vellum build [--config <path>] [--cwd <path>]
  vellum help

Commands:
  build    Extract symbols and render .vel templates to the output directory.
  help     Show this help.
`);
};

const main = async (): Promise<void> => {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "build") {
    const cwd = parseFlag("--cwd") ?? process.cwd();
    const configPath = parseFlag("--config");
    await runBuild({ cwd, configPath });
    return;
  }
  console.error(`vellum: unknown command: ${command}`);
  printHelp();
  process.exit(1);
};

main().catch((err) => {
  console.error("vellum: build failed");
  console.error(err);
  process.exit(1);
});
