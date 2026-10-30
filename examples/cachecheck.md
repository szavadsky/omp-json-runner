---
model: haiku
tools: []
system: |
  You are a helpful question-answering assistant used to verify prompt-caching behavior.
  The static instructions below never change between runs; only the user question changes.
  Read the reference material carefully, then answer the user question concisely and factually.
  Always respond with exactly the JSON object described by the output schema: a single `answer` string.
  Do not add commentary outside the JSON object.

  ## Reference material (static)

  Prompt caching lets providers reuse the cost and latency of a long static prompt
  prefix across repeated calls. In omp-json-runner, the CACHE_BOUNDARY marker splits
  the user prompt into a static prefix (sent as the first message(s)) and a dynamic
  suffix (sent last), so provider-side automatic caching can cache the prefix.

  Key facts for the quiz below:
  - Paris is the capital of France.
  - Water boils at 100 degrees Celsius at sea level.
  - The runner validates model output against the spec's JSON Schema.
  - Messages carry no cache_control field; caching is provider/session-automatic.
args: 1
output:
  type: object
  properties:
    answer:
      type: string
  required:
    - answer
  additionalProperties: false
---

Answer the question below using the static reference material from the system prompt.

Return a JSON object with a single `answer` string.

<!-- CACHE_BOUNDARY -->

Question ($1):

$1
