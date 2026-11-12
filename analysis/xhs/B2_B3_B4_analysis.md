# B2–B4: Xiaohongshu signer — harness, deobfuscation, and algorithm

Reproduce with `make xhs` (extract payload → eval-string-array pass → harness run).

## B2: harness and fingerprint surface

The extracted signer payload (`samples/xhs/signer_payload.js`) runs under the same
logging-Proxy shim as TikTok ([tools/harness/run_xhs.js](../../tools/harness/run_xhs.js)),
on fixed inputs with a synthetic `a1` cookie, fixed timestamp (1700000000000), and
deterministic randomness. The payload **loads cleanly** and defines its globals (the
signer entry plus ~20 hash-named helpers). It reads, from the environment before it
aborts (see B5), exactly ([data/xhs_fingerprint_surface.json](../../data/xhs_fingerprint_surface.json)):

| Read | Likely purpose |
|---|---|
| `document.cookie` | the `a1` / `webId` / `gid` inputs |
| `document.documentElement.getAttribute(...)` | **automation / tamper marker check** |
| `document.addEventListener` | event hook (behavioural signal) |

The `documentElement.getAttribute` read, reached right before the signer throws, is the
visible edge of an **environment-integrity check** (see B5). This surface is smaller
than TikTok's because the signer aborts early; it is a real finding, not the full set.

## B3: deobfuscation

The payload is `javascript-obfuscator` output. Structure recovered:

```
var _0x5ae8 = ['doeZk', 'vSuEv', ...];        // string array (1045 entries)
var _0xc8b2 = function (i, k) { ... _0x5ae8[i - 0x0] ... };  // decoder (base64/RC4-ish)
var _0xe762c0 = _0xc8b2;                       // alias
(function (a, b) { while (!![]) { ... a.push(a.shift()); ... parseInt ... } }(...));  // rotation
glb["_AUuXfEG27Xa3x"] = function (a, b, c) { ... };          // the signer, on window
```

We built a reusable **evaluating string-array pass**
([tools/deobf/passes/string-array-eval.js](../../tools/deobf/passes/string-array-eval.js),
2 tests): it finds the array and decoder by structure, resolves decoder **aliases
transitively** (40 in this payload, including per-function local aliases), evaluates the
array+rotation+decoder prelude in a sandbox, and rewrites decoder calls with literal
arguments to their decoded strings. On the payload it resolves **297** such calls
(method names `apply`, `push`, `fromCharCode`, `prototype`, `slice`, `call`, …),
confirming the decoder model.

**Remaining layers (not fully stripped — honest status):**
1. Many decoder calls use **computed/variable indices**, so they cannot be replaced
   statically; the strings they fetch (including the header names) are only resolved at
   runtime.
2. **Control-flow flattening** (`while(true){switch...}` dispatchers) inside the signer
   body — an unflattening pass is future work (noted in Limitations).
3. Two **encrypted hex data blobs** `__$c` and `__bc` (`'56544b4242...'`) interpreted at
   runtime — the signer is partly data-driven (a mini-interpreter), not pure inline JS.

So the Part A string-array pass **did** apply here (unlike TikTok 1.16.6), but XHS adds
control-flow flattening and an encrypted data blob on top.

## B4: algorithm — what is established vs. unverified

**Input → output contract (B1, verified):** `window.sign(url, body)` → header object
merged into the request (`x-s`, `x-t`, `x-s-common`). Internally this reaches
`glb["_AUuXfEG27Xa3x"](url, body, ctx)`. Inputs observed/declared: the request URL
(URI + serialized query), the body, the `a1` cookie, and a timestamp.

**Observed at runtime:** a reachable helper builds a to-be-signed string of the form
`"<url>" + 1013904243` — the constant **1013904243** (a Numerical-Recipes LCG
increment, also seen in TikTok's pool) is concatenated to the URL. This is consistent
with a seeded-PRNG or counter mixed into the signed material.

**Primitive evidence (partial):** `MD5` string present; `atob`/base64 and
`unescape`/`fromCharCode` encoding; the LCG constant above. The MD5 *magic constants*
are **not** present as plaintext literals — they are inside the encrypted `__$c`/`__bc`
blobs or computed, so MD5 use is **referenced but not byte-level confirmed**. The older
public claim of "MD5 + RC4/XOR + custom Base64/Base58" is **plausible and partly
supported** (base64 confirmed; MD5 referenced; RC4/custom-alphabet not independently
confirmed on this 2026 bundle).

**Pipeline (to the level supported by evidence):**

```
url (URI+query), body, a1 cookie, timestamp
        │
        ▼
build to-be-signed string  ──(+ LCG constant 1013904243, counter/seed)──►  s
        │
        ▼
hash/encode (MD5 referenced; base64 confirmed; data-blob-driven steps __$c/__bc)
        │
        ▼
{ x-s, x-t, x-s-common }  ──► merged into request headers
```

The exact hash and the role of `__$c`/`__bc` are **unverified**; confirming them needs
either passing the environment check (to trace a produced signature) or reversing the
encrypted blobs — both deferred, and the latter approaches building a signer, which the
project keeps out of the public repo.

## Contrast with TikTok (feeds Part C)

| | TikTok webmssdk 1.16.6 | Xiaohongshu signer |
|---|---|---|
| Core protection | bespoke **bytecode VM** (365 opcodes) | **javascript-obfuscator** (string array + CFG flattening) + encrypted data blob |
| String hiding | in-VM base64 + XOR pool | JS string-array decoder (base64/RC4-ish) + XOR |
| Bytecode | base64 + raw DEFLATE | encrypted hex blobs `__$c`/`__bc` (partial) |
| Headless signing | blocked (env init) | blocked (env-integrity check, `err:d93135`) |
| Shared constant | LCG `1013904223`/`1013904243`, golden-ratio 0x9E3779B9 | LCG `1013904243` |
