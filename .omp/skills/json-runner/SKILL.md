---
name: json-runner
description: Running completions to json through omp command line wrapper
---

# json-runner

Run a model completion that returns validated JSON, via the omp CLI wrapper
(Bun + omp SDK). The spec file owns model resolution and prompt-cache layout,
not the caller.

## Usage

```sh
bun install          # once, in the runner checkout
bun src/cli.ts <spec.md> <out.json> <input1> [<input2> ...]
```

Exit `0` writes pretty JSON to `<out.json>` (also stdout) plus one
`omp-json-runner usage {"input":N,"output":N,"cacheRead":N,"cacheWrite":N}`
stderr line; `2` = usage error; `1` = run failure.

## Spec file

Markdown with YAML frontmatter plus a body:

- `model:` role/alias/pattern (`default`, `@smol`, `provider/model`)
- `tools:` allowlist (`[]` = no tools: single-turn JSON answer)
- `system:` system prompt (`$N` substitution applies)
- `args:` N — the CLI must pass exactly N input files
- `output:` JSON Schema the final JSON is validated against
- body: user prompt; `$1..$N` expand to input file contents (`$$` escapes)

Put shared instructions and reference material before the
`<!-- CACHE_BOUNDARY -->` line and the `$N` inputs after it: the runner
sends two user messages so provider-side automatic caching reuses the
static prefix across runs. Override `model:` per run by copying the spec.

See `README.md` and `examples/` for the full contract and a smoke test.
