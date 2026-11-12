# A5: runtime tracing — token→function mapping and the signing primitives

Goal (from the brief): in the Node harness, identify which VM functions produce
X-Bogus, X-Gnarly and strData, and describe each pipeline (inputs, primitives,
outputs). Reproduce with `make trace` (harness) plus the mapping tools in `tools/vm/`.

## The harness (reusable)

[tools/harness/env.js](../../tools/harness/env.js) is a logging-Proxy browser shim:
every property read on `window/navigator/document/screen/...` is recorded, all values
are fixed synthetic stubs, and time/randomness are deterministic. No network, no real
device data. [tools/harness/run_tiktok.js](../../tools/harness/run_tiktok.js) loads the
beautified bundle in a `node:vm` context on that shim with two source hooks injected:

- the string decoder `l(n,t)` → every decoded string logged with its key;
- the dispatch `d[f](u)` → every executed opcode counted.

### What the run shows

The bootstrap executes **8,884 VM dispatches across 89 distinct opcodes** before it
stops (the SDK references browser APIs we do not fully emulate; headless boot to a
produced signature was not reached — see Limitations). Even so, the decoder hook
recovers correct plaintext at runtime — e.g. the base62 alphabet, `Math`, `random`,
`imul`, `TextEncoder`, `charCodeAt`, `Function`, `prototype` — which **confirms the
string model** (base64 → XOR with a pool key). The partial fingerprint surface touched
during bootstrap is in
[data/tiktok_fingerprint_surface.json](../../data/tiktok_fingerprint_surface.json):
`document.addEventListener`, `document.readyState`, `navigator.connection` /
`mozConnection` / `webkitConnection`, `screen`, `location`, `localStorage`,
`sessionStorage`, `history`, `performance`, `crypto`, the Slardar telemetry registry,
and `JS_MD5_NO_NODE_JS` (the flag of a bundled MD5 implementation — direct evidence of
MD5 in the pipeline).

## Token → function mapping (our analog of the reference's vm103/vm249/vm42)

Header names are not literals in the handler source; they sit in the base64/XOR string
pool `A` and are loaded by bytecode operands. We recovered their pool indices by
brute-forcing keys and keeping only exact matches to known token names (an exact
"X-Bogus" decode cannot be coincidental):

| Token | Pool index |
|---|---|
| `msToken` | A[685] |
| `X-Bogus` | A[686] |
| `X-Gnarly` | A[688] |
| `X-MS-STUB` | A[753] |
| `X-MS-PAYLOAD` | A[754] |
| `/web/report` | A[1032] |

Then we scanned the recursive-descent disassembly for instructions whose operands load
those indices, giving the producing/attaching functions
([data/tiktok_token_map_1.16.6.json](../../data/tiktok_token_map_1.16.6.json)):

| Output | VM function entry offsets (ours) | Reference (1.12.2) |
|---|---|---|
| all request headers (assembly site) | **fn@61636** (loads msToken+X-Bogus+X-Gnarly together) | — |
| **X-Bogus** | fn@61636, **fn@70647, fn@71583, fn@72103, fn@72253** (with X-MS-STUB/X-MS-PAYLOAD) | vm103 |
| **X-Gnarly** | fn@61636, **fn@73223** (with X-MS-STUB) | vm249 |
| `msToken` | fn@61636, fn@62499, fn@62796, fn@96632/96644 | — |
| `/web/report` (telemetry) | fn@264 and ~12 others | — |

**Structural difference from the reference.** In 1.12.2 each token had a single entry
function (vm103/vm249). In 1.16.6 the header names are assembled together at one site
(fn@61636) and each signature has a small cluster of functions pairing it with the
X-MS-STUB/X-MS-PAYLOAD envelope. This is consistent with the heavier, more specialised
VM found in A4.

### strData

We did not find a `strData` string in the 1.16.6 pool. The reference located it from
the object `{magic: 538969122, …, strData, tspFromClient}`. The magic **538969122 is
present in our numeric constant pool `y`** (A4), so the same envelope exists, but the
field is keyed differently or built structurally rather than from a pooled literal.
Marked unverified.

## Primitives (inputs → crypto → outputs)

From the numeric constant pool `y` (A4) and the MD5 evidence above, the pipeline draws
on: **MD5** (`JS_MD5_NO_NODE_JS`; MD5-of-empty-string in the reference's vm103),
**SHA-256** (round-constant table K in `y`), **FNV-1** (offset `2166136260`, prime
`16777619`), an **LCG PRNG** (`1013904223`), and a **TEA/XXTEA-family mix**
(`0x9E3779B9`). The signature envelope uses magic `538969122`. Confirming the exact
order in which these combine to form X-Bogus requires completing the headless boot (a
produced signature), which we did not do; the primitive *inventory* is evidenced, the
exact *composition* is not yet traced end-to-end.

## Limitations (carried to the paper)

1. No signature was produced headless, so the token→function map is from static
   operand analysis of our disassembly, not from observing a live X-Bogus being built.
   It identifies the functions that reference each header name; it does not prove the
   full byte-level pipeline.
2. The fingerprint surface is the bootstrap-phase subset (~29 paths); the complete
   surface needs a fuller environment. The harness is the reusable deliverable.
3. `strData` unlocated in 1.16.6 (reference-era field; envelope magic still present).
