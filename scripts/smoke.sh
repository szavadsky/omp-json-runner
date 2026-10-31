#!/usr/bin/env bash
# Smoke test for omp-json-runner.
# Runs: (1) echo on smol, no tools; (2) summarize on smol with tools;
# (3) cachecheck on haiku TWICE (exercises the static-prefix cache path).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

check_keys() {
  # $1 = json path, $2.. = expected top-level keys
  local file="$1"; shift
  bun -e '
    const [file, ...keys] = Bun.argv.slice(1);
    const data = await Bun.file(file).json();
    for (const k of keys) {
      if (!(k in data)) throw new Error(`missing key ${k} in ${file}`);
    }
  ' "$file" "$@"
}

check_usage() {
  # $1 = stderr path, $2 = field (cacheRead|cacheWrite), $3 = run label
  local stderr="$1" field="$2" label="$3"
  local line
  line="$(grep -m1 'omp-json-runner usage ' "$stderr" || true)"
  if [ -z "$line" ]; then
    echo "FAIL $label: missing 'omp-json-runner usage {...}' stderr line ($stderr):" >&2
    cat "$stderr" >&2
    return 1
  fi
  local value
  value="$(printf '%s\n' "$line" | sed -n "s/.*\"$field\":\([0-9][0-9]*\).*/\1/p")"
  if [ -z "$value" ]; then
    echo "FAIL $label: usage line has no numeric \"$field\" field: $line" >&2
    return 1
  fi
  if [ "$value" -le 0 ]; then
    echo "FAIL $label: expected $field>0, got $value ($line)" >&2
    return 1
  fi
  echo "PASS $label: $field=$value"
}

echo "--- [1/3] echo (smol, no tools) ---"
bun src/cli.ts examples/echo.md /tmp/echo.out.json examples/inputs/hello.txt
check_keys /tmp/echo.out.json text chars
echo "PASS echo: /tmp/echo.out.json has keys text, chars"

echo "--- [2/3] summarize (smol, tools: read/grep/glob) ---"
bun src/cli.ts examples/summarize.md /tmp/summarize.out.json examples/inputs/hello.txt examples/inputs/notes.txt
check_keys /tmp/summarize.out.json summary files
echo "PASS summarize: /tmp/summarize.out.json has keys summary, files"

echo "--- [3/3] cachecheck (haiku) x2 ---"
echo "What is the capital of France?" > /tmp/cache-q.txt
bun src/cli.ts examples/cachecheck.md /tmp/cache1.out.json /tmp/cache-q.txt 2>/tmp/cache1.stderr
check_keys /tmp/cache1.out.json answer
echo "PASS cachecheck run 1: /tmp/cache1.out.json has key answer"
check_usage /tmp/cache1.stderr cacheWrite "cachecheck run 1 (cold)" || check_usage /tmp/cache1.stderr cacheRead "cachecheck run 1 (warm)"
bun src/cli.ts examples/cachecheck.md /tmp/cache2.out.json /tmp/cache-q.txt 2>/tmp/cache2.stderr
check_keys /tmp/cache2.out.json answer
echo "PASS cachecheck run 2: /tmp/cache2.out.json has key answer"
check_usage /tmp/cache2.stderr cacheRead "cachecheck run 2"

echo "ALL SMOKE TESTS PASSED"
