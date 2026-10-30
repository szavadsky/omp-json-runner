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
| `model`  | yes      | Model pattern/alias resolved via omp `Settings` (e.g. `smol`, `@smol`, `anthropic/claude-haiku-4-5`). |
| `tools`  | no       | Allowed tools: CSV string, string array, or `null`. Default `[]` = **no tools** (note: this differs from the omp agent default, which enables tools). Names are normalized like omp (`read`, `grep`, `glob`, …). |
| `system` | yes      | System prompt string. Supports `$N` substitution like the body.                                  |
| `args`   | yes      | Integer ≥ 1: how many file inputs the spec takes. CLI must pass exactly this many.               |
| `output` | yes      | JSON Schema (object) the model's final JSON is validated against.                                |

Body = the **user prompt** (required, non-empty). It also supports `$N`
substitution: `$1`..`$N` are replaced with the contents of input files;
`$$` escapes to a literal `$`. Referencing `$k` with `k < 1` or
`k > inputs.length` is an error.

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
bun src/cli.ts <spec.md> <out.json> <input1> [<input2> ...]
```

- Reads each input file as UTF-8 text, substitutes `$N` into `system` and the
  user prompt, runs the agent, validates the final JSON against the spec's
  `output` schema, writes pretty-printed JSON to `<out.json>`, and also
  prints it to stdout.
- Exit codes: `0` success (final JSON on stdout), `2` usage error
  (wrong arg count), `1` run failure (message to stderr).

## Tools / yield semantics

- The agent gets exactly the spec's `tools` allowlist (default: none).
  With no tools the model must answer directly; with tools (e.g.
  `examples/summarize.md`) it may call them before answering.
- The run ends when the model **yields** (calls the yield/show-result tool
  with its final answer) instead of calling a tool. The yielded text must
  parse as JSON (repair attempted) and validate against the spec schema.
- After a yield whose JSON is invalid, the runner issues **one reminder
  turn** asking for corrected JSON; if the next yield is still invalid,
  the run fails.

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
  Haiku-class model, copy the spec and change its `model:` frontmatter
  key, e.g. `cp examples/cachecheck.md /tmp/cachecheck.local.md`
  and edit the `model:` line.
