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

## Static reference corpus (fixed; identical on every run)

Reference entry 1: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 1 of the static corpus, unchanged between runs).
Reference entry 2: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 2 of the static corpus, unchanged between runs).
Reference entry 3: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 3 of the static corpus, unchanged between runs).
Reference entry 4: Messages carry no cache_control field; caching is provider and session automatic. (entry 4 of the static corpus, unchanged between runs).
Reference entry 5: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 5 of the static corpus, unchanged between runs).
Reference entry 6: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 6 of the static corpus, unchanged between runs).
Reference entry 7: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 7 of the static corpus, unchanged between runs).
Reference entry 8: The static prefix is sent as the first message so providers can cache it across runs. (entry 8 of the static corpus, unchanged between runs).
Reference entry 9: JSON Schema required fields must all be present in the model output for validation to pass. (entry 9 of the static corpus, unchanged between runs).
Reference entry 10: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 10 of the static corpus, unchanged between runs).
Reference entry 11: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 11 of the static corpus, unchanged between runs).
Reference entry 12: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 12 of the static corpus, unchanged between runs).
Reference entry 13: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 13 of the static corpus, unchanged between runs).
Reference entry 14: Messages carry no cache_control field; caching is provider and session automatic. (entry 14 of the static corpus, unchanged between runs).
Reference entry 15: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 15 of the static corpus, unchanged between runs).
Reference entry 16: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 16 of the static corpus, unchanged between runs).
Reference entry 17: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 17 of the static corpus, unchanged between runs).
Reference entry 18: The static prefix is sent as the first message so providers can cache it across runs. (entry 18 of the static corpus, unchanged between runs).
Reference entry 19: JSON Schema required fields must all be present in the model output for validation to pass. (entry 19 of the static corpus, unchanged between runs).
Reference entry 20: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 20 of the static corpus, unchanged between runs).
Reference entry 21: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 21 of the static corpus, unchanged between runs).
Reference entry 22: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 22 of the static corpus, unchanged between runs).
Reference entry 23: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 23 of the static corpus, unchanged between runs).
Reference entry 24: Messages carry no cache_control field; caching is provider and session automatic. (entry 24 of the static corpus, unchanged between runs).
Reference entry 25: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 25 of the static corpus, unchanged between runs).
Reference entry 26: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 26 of the static corpus, unchanged between runs).
Reference entry 27: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 27 of the static corpus, unchanged between runs).
Reference entry 28: The static prefix is sent as the first message so providers can cache it across runs. (entry 28 of the static corpus, unchanged between runs).
Reference entry 29: JSON Schema required fields must all be present in the model output for validation to pass. (entry 29 of the static corpus, unchanged between runs).
Reference entry 30: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 30 of the static corpus, unchanged between runs).
Reference entry 31: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 31 of the static corpus, unchanged between runs).
Reference entry 32: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 32 of the static corpus, unchanged between runs).
Reference entry 33: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 33 of the static corpus, unchanged between runs).
Reference entry 34: Messages carry no cache_control field; caching is provider and session automatic. (entry 34 of the static corpus, unchanged between runs).
Reference entry 35: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 35 of the static corpus, unchanged between runs).
Reference entry 36: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 36 of the static corpus, unchanged between runs).
Reference entry 37: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 37 of the static corpus, unchanged between runs).
Reference entry 38: The static prefix is sent as the first message so providers can cache it across runs. (entry 38 of the static corpus, unchanged between runs).
Reference entry 39: JSON Schema required fields must all be present in the model output for validation to pass. (entry 39 of the static corpus, unchanged between runs).
Reference entry 40: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 40 of the static corpus, unchanged between runs).
Reference entry 41: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 41 of the static corpus, unchanged between runs).
Reference entry 42: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 42 of the static corpus, unchanged between runs).
Reference entry 43: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 43 of the static corpus, unchanged between runs).
Reference entry 44: Messages carry no cache_control field; caching is provider and session automatic. (entry 44 of the static corpus, unchanged between runs).
Reference entry 45: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 45 of the static corpus, unchanged between runs).
Reference entry 46: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 46 of the static corpus, unchanged between runs).
Reference entry 47: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 47 of the static corpus, unchanged between runs).
Reference entry 48: The static prefix is sent as the first message so providers can cache it across runs. (entry 48 of the static corpus, unchanged between runs).
Reference entry 49: JSON Schema required fields must all be present in the model output for validation to pass. (entry 49 of the static corpus, unchanged between runs).
Reference entry 50: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 50 of the static corpus, unchanged between runs).
Reference entry 51: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 51 of the static corpus, unchanged between runs).
Reference entry 52: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 52 of the static corpus, unchanged between runs).
Reference entry 53: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 53 of the static corpus, unchanged between runs).
Reference entry 54: Messages carry no cache_control field; caching is provider and session automatic. (entry 54 of the static corpus, unchanged between runs).
Reference entry 55: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 55 of the static corpus, unchanged between runs).
Reference entry 56: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 56 of the static corpus, unchanged between runs).
Reference entry 57: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 57 of the static corpus, unchanged between runs).
Reference entry 58: The static prefix is sent as the first message so providers can cache it across runs. (entry 58 of the static corpus, unchanged between runs).
Reference entry 59: JSON Schema required fields must all be present in the model output for validation to pass. (entry 59 of the static corpus, unchanged between runs).
Reference entry 60: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 60 of the static corpus, unchanged between runs).
Reference entry 61: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 61 of the static corpus, unchanged between runs).
Reference entry 62: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 62 of the static corpus, unchanged between runs).
Reference entry 63: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 63 of the static corpus, unchanged between runs).
Reference entry 64: Messages carry no cache_control field; caching is provider and session automatic. (entry 64 of the static corpus, unchanged between runs).
Reference entry 65: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 65 of the static corpus, unchanged between runs).
Reference entry 66: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 66 of the static corpus, unchanged between runs).
Reference entry 67: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 67 of the static corpus, unchanged between runs).
Reference entry 68: The static prefix is sent as the first message so providers can cache it across runs. (entry 68 of the static corpus, unchanged between runs).
Reference entry 69: JSON Schema required fields must all be present in the model output for validation to pass. (entry 69 of the static corpus, unchanged between runs).
Reference entry 70: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 70 of the static corpus, unchanged between runs).
Reference entry 71: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 71 of the static corpus, unchanged between runs).
Reference entry 72: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 72 of the static corpus, unchanged between runs).
Reference entry 73: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 73 of the static corpus, unchanged between runs).
Reference entry 74: Messages carry no cache_control field; caching is provider and session automatic. (entry 74 of the static corpus, unchanged between runs).
Reference entry 75: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 75 of the static corpus, unchanged between runs).
Reference entry 76: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 76 of the static corpus, unchanged between runs).
Reference entry 77: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 77 of the static corpus, unchanged between runs).
Reference entry 78: The static prefix is sent as the first message so providers can cache it across runs. (entry 78 of the static corpus, unchanged between runs).
Reference entry 79: JSON Schema required fields must all be present in the model output for validation to pass. (entry 79 of the static corpus, unchanged between runs).
Reference entry 80: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 80 of the static corpus, unchanged between runs).
Reference entry 81: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 81 of the static corpus, unchanged between runs).
Reference entry 82: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 82 of the static corpus, unchanged between runs).
Reference entry 83: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 83 of the static corpus, unchanged between runs).
Reference entry 84: Messages carry no cache_control field; caching is provider and session automatic. (entry 84 of the static corpus, unchanged between runs).
Reference entry 85: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 85 of the static corpus, unchanged between runs).
Reference entry 86: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 86 of the static corpus, unchanged between runs).
Reference entry 87: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 87 of the static corpus, unchanged between runs).
Reference entry 88: The static prefix is sent as the first message so providers can cache it across runs. (entry 88 of the static corpus, unchanged between runs).
Reference entry 89: JSON Schema required fields must all be present in the model output for validation to pass. (entry 89 of the static corpus, unchanged between runs).
Reference entry 90: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 90 of the static corpus, unchanged between runs).
Reference entry 91: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 91 of the static corpus, unchanged between runs).
Reference entry 92: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 92 of the static corpus, unchanged between runs).
Reference entry 93: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 93 of the static corpus, unchanged between runs).
Reference entry 94: Messages carry no cache_control field; caching is provider and session automatic. (entry 94 of the static corpus, unchanged between runs).
Reference entry 95: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 95 of the static corpus, unchanged between runs).
Reference entry 96: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 96 of the static corpus, unchanged between runs).
Reference entry 97: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 97 of the static corpus, unchanged between runs).
Reference entry 98: The static prefix is sent as the first message so providers can cache it across runs. (entry 98 of the static corpus, unchanged between runs).
Reference entry 99: JSON Schema required fields must all be present in the model output for validation to pass. (entry 99 of the static corpus, unchanged between runs).
Reference entry 100: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 100 of the static corpus, unchanged between runs).
Reference entry 101: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 101 of the static corpus, unchanged between runs).
Reference entry 102: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 102 of the static corpus, unchanged between runs).
Reference entry 103: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 103 of the static corpus, unchanged between runs).
Reference entry 104: Messages carry no cache_control field; caching is provider and session automatic. (entry 104 of the static corpus, unchanged between runs).
Reference entry 105: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 105 of the static corpus, unchanged between runs).
Reference entry 106: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 106 of the static corpus, unchanged between runs).
Reference entry 107: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 107 of the static corpus, unchanged between runs).
Reference entry 108: The static prefix is sent as the first message so providers can cache it across runs. (entry 108 of the static corpus, unchanged between runs).
Reference entry 109: JSON Schema required fields must all be present in the model output for validation to pass. (entry 109 of the static corpus, unchanged between runs).
Reference entry 110: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 110 of the static corpus, unchanged between runs).
Reference entry 111: Paris is the capital of France, a city on the Seine known for the Eiffel Tower, the Louvre, and Haussmann boulevards. (entry 111 of the static corpus, unchanged between runs).
Reference entry 112: Water boils at 100 degrees Celsius at sea level, where atmospheric pressure equals one standard atmosphere. (entry 112 of the static corpus, unchanged between runs).
Reference entry 113: The runner validates model output against the spec's JSON Schema before writing the result file. (entry 113 of the static corpus, unchanged between runs).
Reference entry 114: Messages carry no cache_control field; caching is provider and session automatic. (entry 114 of the static corpus, unchanged between runs).
Reference entry 115: The CACHE_BOUNDARY marker splits the user prompt into a static prefix and a dynamic suffix. (entry 115 of the static corpus, unchanged between runs).
Reference entry 116: Lisbon is the capital of Portugal, set on the Tagus estuary with seven fabled hills. (entry 116 of the static corpus, unchanged between runs).
Reference entry 117: Honey never spoils; edible honey has been recovered from ancient Egyptian tombs. (entry 117 of the static corpus, unchanged between runs).
Reference entry 118: The static prefix is sent as the first message so providers can cache it across runs. (entry 118 of the static corpus, unchanged between runs).
Reference entry 119: JSON Schema required fields must all be present in the model output for validation to pass. (entry 119 of the static corpus, unchanged between runs).
Reference entry 120: Ottawa is the capital of Canada, chosen by Queen Victoria in 1857 as a compromise site. (entry 120 of the static corpus, unchanged between runs).

<!-- CACHE_BOUNDARY -->

Question ($1):

$1
