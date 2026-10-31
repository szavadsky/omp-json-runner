#!/usr/bin/env bun
import { run, UsageError } from "./run.js";

const USAGE = "usage: bun src/cli.ts <spec.md> <out.json> <input1> [<input2>...]";

const argv = process.argv.slice(2);

if (argv.length > 0 && (argv[0] === "--help" || argv[0] === "-h")) {
  console.log(USAGE);
  process.exit(0);
}

if (argv.length < 3) {
  console.error(USAGE);
  process.exit(2);
}

const [specPath, outPath, ...inputPaths] = argv as [string, string, ...string[]];

try {
  const result = await run({ specPath, outPath, inputPaths });
  console.log(JSON.stringify(result.data));
  process.exit(0);
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(err instanceof UsageError ? 2 : 1);
}
