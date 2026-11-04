# omp-json-runner

`omp-json-runner` is a small Bun + omp SDK CLI that runs a **spec file**
(an agent-style Markdown file with YAML frontmatter) over `$N` file inputs
and writes **validated JSON** output.

## Install

```sh
bun install
```

Requires Bun and an [omp](https://github.com/oh-my-pi) setup with auth
configured (see "Auth / models" below).

## Spec format

A spec is a `.md` file with YAML frontmatter plus a Markdown body:

```md
---
model: smol
tools: [read, grep]
system: |
  You are a helpful assistant.
args: 2
output:
  type: object
  properties:
    summary:
      type: string
  required: [summary]
  additionalProperties: false
---

Summarize both inputs in one paragraph.

<!-- CACHE_BOUNDARY -->

First input ($1):

$1

Second input ($2):

$2
```

Frontmatter keys:

| Key      | Required | Meaning                                                                                          |
|----------|----------|--------------------------------------------------------------------------------------------------|
| `model`  | yes      | Model pattern/alias resolved via omp `Settings`: bare role names (`task`, `default`), `@`-prefixed aliases (`@task`), or (discouraged) full `provider/model` patterns. |
| `tools`  | no       | Allowed tools: CSV string, string array, or `null`. Default `[]` = **no tools** (note: this differs from the omp agent default, which enables tools). Names are normalized like omp (`read`, `grep`, `glob`, …) and rejected if unknown. |
| `system` | yes      | System prompt string. Supports `$N`/`{slug}` substitution like the body (text only — an image ref here is a usage error). |
| `args`   | yes      | Integer ≥ 1: how many file inputs the spec takes. CLI must pass exactly this many.               |
| `slugs`  | no       | Array of `args` names (`[A-Za-z0-9_-]+`, unique) enabling `{slug}` refs; default `input1..inputN`. |
| `output` | yes      | JSON Schema (object) the model's final JSON is validated against. Keys are kept verbatim (no kebab→camel normalization). MUST be provider-strict: EVERY `object` needs `additionalProperties: false`, and unions containing `object` (e.g. `type: [string, object]`) are BANNED — some providers reject them with 400, which surfaces as a primary failure (then silent fallback unless `--no-fallback`). |
| `thinking` / `thinkingLevel` | no | Optional thinking-level hint string (e.g. `high`); `thinkingLevel` wins when both are set. |

## Inputs & template refs

Each CLI input file is auto-detected: **images** (png/jpeg/gif/webp by magic
bytes, svg/svgz rasterized; loaded through the SDK vision pipeline with
auto-resize) become native image parts; everything else is read as UTF-8
**text**. The model must support vision (`model.input` includes `image`)
when any input is an image.

Body (and `system`) support four ref forms; `$$` escapes to a literal `$`:

| Form | Meaning |
|------|---------|
| `$N` | Content of input N. Images interleave AT the ref position (text, IMAGE, text — part order preserved on the wire). |
| `...$N` | **Variadic**: inputs N..last, each a block joined by blank lines. |
| `{slug}` | Content of the `slugs:`-named input, wrapped in `-- BEGIN slug --` / `-- END slug --` markers. A `{slug}` matching NO spec input passes through **verbatim** (JSON examples like `{"type": "object"}` need no escaping) — so avoid generic slugs like `type`. |
| `...{slug}` | **Variadic from slug**: that input..last, each with its OWN slug markers. |

Referencing `$k` with `k < 1` or `k > inputs.length` is an error. Ask for
each image ONCE: every ref occurrence attaches the image again (plus a
`[Image: label]` text marker). Images follow their ref's cache half (refs
before the marker ride the static message). With tools, images attach
trailing (session API limit) — the no-tools path interleaves exactly.
Example: `examples/vision.md` (images + slugs + variadic).

### `CACHE_BOUNDARY`

If the substituted user prompt contains the marker line
`<!-- CACHE_BOUNDARY -->`, the runner splits on its **first** occurrence:

- everything before it = **static prefix** (sent as the first message(s)),
- everything after it = **dynamic suffix** (sent last).

Messages carry **no** `cache_control` field — prompt caching is
provider/session-automatic. The split only orders messages so auto-caching
can cache the static prefix across runs. Put shared instructions and
reference material before the marker, and `$N` inputs after it.
Without the marker the whole prompt is sent as one user message.

## CLI usage

```sh
bun src/cli.ts [--model <pattern>] [--no-fallback] <spec.md> <out.json> <input1> [<input2> ...]
```

- Reads each input file (text as UTF-8, images as native vision parts —
  see "Inputs & template refs"), substitutes refs into `system` and the
  user prompt, runs the agent, validates the final JSON against the spec's
  `output` schema, writes pretty-printed JSON to `<out.json>`, and also
  prints it to stdout.
- `--model <pattern>`: optional override for the spec frontmatter `model:`
  key. Allows reusing a single spec file across multiple models without duplicating
  it (e.g. for consensus or ensemble evaluations). Supports bare role names,
  `@role` aliases, `provider/model` patterns, and optional `:thinking`
  suffixes (e.g. `task:high`). Prefer bare aliases — NEVER hardcode a concrete
  `provider/model` id in specs or scripts; resolve via omp `Settings` roles.
- `--no-fallback`: only try the primary model; fail instead of walking the
  role's `retry.fallbackChains`. REQUIRED for consult steps (their scripts also
  assert the served model equals the alias primary and REFUSE mismatched output).
- Writes one telemetry line to stderr per run:
  `omp-json-runner usage {"input":N,"output":N,"cacheRead":N,"cacheWrite":N,"model":"provider/id"}`
  (best-effort token counts; `0` when unavailable; `model` is the SERVED model —
  always verify it equals the alias primary before trusting the output).
- Exit codes: `0` success (final JSON on stdout) or `--help` (prints usage),
  `2` usage error (unknown flags, fewer than 3 positional args),
  `1` run failure (message to stderr). `response truncated (length limit)` =
  output hit the model's cap: narrow the schema or move to an alias with a higher
  output ceiling (consult specs document their alias choice + observed tokens).
- No `--max-tokens` knob: output length is governed by the model + thinking level
  (`:max`/`:high` suffix or spec `thinking:`/`thinkingLevel:` key, both optional).

### Consensus / ensemble example

Run the same spec across multiple models (or 3x on one model), then merge
the outputs — e.g. union the fix-ids for recall, majority-vote the grade:

```sh
# Run 1: task alias
bun src/cli.ts --model task \
  examples/echo.md out/echo-task.json examples/inputs/hello.txt

# Run 2: default alias
bun src/cli.ts --model default \
  examples/echo.md out/echo-default.json examples/inputs/hello.txt

# Merge: fix-id union (recall) + grade majority vote, e.g. with jq/python:
#   union = set(run1.fixes[].id) | set(run2.fixes[].id)
#   grade = majority(run1.grade, run2.grade, run3.grade)
```
## Tools / yield semantics

- The agent gets exactly the spec's `tools` allowlist (default: none).
  With no tools (`examples/echo.md`, `examples/cachecheck.md`) the model must
  answer directly with a single JSON object; with tools (e.g.
  `examples/summarize.md`) it may call them before answering.
- With tools, the run ends when the model **yields** (calls the yield tool
  with its final answer). The yield tool validates `data` against the output
  schema and retries on failure; if no successful yield happens during the
  initial turn, the runner issues **one reminder turn** ("You stopped without
  calling yield...") and fails hard if the model still has not yielded. The
  yielded value must parse as JSON (repair attempted) and validate against
  the spec schema.

## Smoke test

```sh
bash scripts/smoke.sh
```

Runs three specs and validates each output file parses as JSON with the
expected top-level keys:

1. `examples/echo.md` — `smol`, no tools, 1 input → keys `text`, `chars`.
2. `examples/summarize.md` — `smol`, tools `read/grep/glob`, 2 inputs → keys `summary`, `files`.
3. `examples/cachecheck.md` — `haiku`, no tools, 1 input, run **twice**
   (exercises the static-prefix cache path) → key `answer`.

### Auth / models

Smoke runs need omp auth (API keys via your omp config, typically under
`~/.omp/agent`, e.g. `config.yml`) and access to the referenced models:

- `smol` — cheap/fast model alias resolved via omp `Settings`
  (model aliases/roles come from your omp configuration).
- `haiku` — used by `cachecheck.md`. To test against a different
  model, pass `--model <pattern>` on the command line (or copy the spec
  and edit the `model:` frontmatter line).
