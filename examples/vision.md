---
model: smol
tools: []
system: |
  You are a precise vision test assistant.
  Always respond with exactly the JSON object described by the output schema.
  Do not add commentary outside the JSON object.
args: 2
slugs: [first, second]
output:
  type: object
  properties:
    colors:
      type: array
      items:
        type: string
    count:
      type: integer
  required:
    - colors
    - count
  additionalProperties: false
---
Name the dominant color of EACH attached image, in attachment order.

Return a JSON object with `colors` (one lowercase color word per image, in order) and `count` (number of images described).

<!-- CACHE_BOUNDARY -->

First image:

{first}

Remaining images:

...{second}
