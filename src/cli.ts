#!/usr/bin/env bun
import { run, UsageError } from "./run.js";

const USAGE = "usage: bun src/cli.ts [--model <pattern>] [--no-fallback] <spec.md> <out.json> <input1> [<input2>...]";

const HELP = `${USAGE}

Arguments:
  <spec.md>            Path to spec file with YAML frontmatter
  <out.json>           Destination for validated JSON output
  <input1> ...         Input file paths: text (UTF-8) or images
                       (png/jpg/gif/webp by magic bytes, svg/svgz by
                       extension). Count must match spec 'args'.
                       Template refs: $N, ...$N (variadic), {slug} and
                       ...{slug} (spec 'slugs:' names, BEGIN/END-marked).

Options:
  --model <pattern>    Override model specified in spec frontmatter
  --no-fallback        Only try the primary model; fail instead of walking the role chain
  -h, --help           Show this help message
`;

const argv = process.argv.slice(2);

let modelOverride: string | undefined;
let noFallback = false;
let i = 0;
while (i < argv.length) {
  const arg = argv[i];
  if (arg === "--help" || arg === "-h") {
    console.log(HELP);
    process.exit(0);
  }
  if (arg === "--model") {
    i++;
    if (i >= argv.length || !argv[i].trim()) {
      console.error("error: --model requires a non-empty pattern argument");
      console.error(USAGE);
      process.exit(2);
    }
    modelOverride = argv[i].trim();
    i++;
    continue;
  }
  if (arg.startsWith("--model=")) {
    const val = arg.slice("--model=".length).trim();
    if (!val) {
      console.error("error: --model requires a non-empty pattern argument");
      console.error(USAGE);
      process.exit(2);
    }
    modelOverride = val;
    i++;
    continue;
  }
  if (arg === "--no-fallback") {
    noFallback = true;
    i++;
    continue;
  }
  if (arg === "--") {
    i++;
    break;
  }
  if (arg.startsWith("-")) {
    console.error(`error: unknown option ${arg}`);
    console.error(USAGE);
    process.exit(2);
  }
  break;
}

const positionalArgs = argv.slice(i);

if (positionalArgs.length < 3) {
  console.error(USAGE);
  process.exit(2);
}

const [specPath, outPath, ...inputPaths] = positionalArgs as [string, string, ...string[]];

try {
  const result = await run({ specPath, outPath, inputPaths, modelOverride, noFallback });
  console.log(JSON.stringify(result.data));
  process.exit(0);
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(err instanceof UsageError ? 2 : 1);
}
