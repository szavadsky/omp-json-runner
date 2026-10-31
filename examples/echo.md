---
model: smol
tools: []
system: |
  You are a precise text echo assistant.
  The user input is provided as $$1.
  Always respond with exactly the JSON object described by the output schema: the full input text and its character count.
  Do not add commentary outside the JSON object.
args: 1
output:
  type: object
  properties:
    text:
      type: string
    chars:
      type: integer
  required:
    - text
    - chars
  additionalProperties: false
---

Echo the input document exactly and report its character count.

Return a JSON object with `text` (the full input verbatim) and `chars` (its length in characters).

<!-- CACHE_BOUNDARY -->

Input document ($1):

$1
