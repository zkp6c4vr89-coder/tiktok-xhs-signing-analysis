# Part C: TikTok vs Xiaohongshu — comparative analysis

Both platforms ship client-side request signing to the web and both resist headless
analysis, but they make **opposite architectural bets**. All claims below trace to the
Part A/B evidence; primitive claims keep the confidence markers from
[analysis/xhs/B2_B3_B4_analysis.md](xhs/B2_B3_B4_analysis.md) and
[analysis/tiktok/](tiktok/) — **confirmed** (observed in our own tooling) vs
**referenced** (named in code/constants but not byte-level validated).

## C1. Obfuscation technique taxonomy

| Technique | TikTok webmssdk 1.16.6 | Xiaohongshu signer (2026) |
|---|---|---|
| Core strategy | **Virtualization**: bespoke bytecode VM | **javascript-obfuscator**: string-array + control-flow flattening |
| Dispatch | register VM, 16-bit opcodes, handler table `d[f]` (365 handlers) | `while(true){switch}` CFG-flattened dispatchers over normal JS |
| String hiding | strings inside the VM bytecode, base64 + repeating-key XOR pool (`l(n,t)`) — **confirmed** | hex-named string array `_0x5ae8` (1045) behind a decoder + 40 aliases — **confirmed** |
| Code/data packing | base64 → **raw DEFLATE** bytecode (98,961 B) — **confirmed** | two encrypted hex data blobs `__$c`/`__bc` interpreted at runtime — **confirmed present**, contents **not decoded** |
| Numeric hiding | numeric constant pool `y` — **confirmed** | inline + data-blob — partial |
| Anti-tamper | environment init gate (bootstrap aborts headless) — **confirmed** | environment-integrity check `err:d93135` (reads `documentElement.getAttribute`) — **confirmed** |
| Self-defense extras | specialised/super-instruction handlers (99 terminal opcodes inline whole functions) | per-function local decoder aliases; rotation IIFE with `parseInt` checksum |

**One-line contrast:** TikTok *virtualizes* its signer into a custom instruction set;
Xiaohongshu *obfuscates* ordinary JavaScript and hides the crypto in encrypted data.
Virtualization raises the fixed cost of analysis (you must first rebuild the VM);
obfuscation raises the per-string/per-branch cost but leaves the language intact.

## C2. VM vs flattened-JS design

- **TikTok** is a true devirtualization target: 365 opcodes, 351 functions, a flat
  98,961-byte image entered via offsets. Analysis requires building a disassembler
  (`tools/vm/`) before any logic is readable. Once built, it generalises across the
  whole program.
- **Xiaohongshu** needs no VM: after the string-array pass (`tools/deobf/`) and (future)
  CFG unflattening, it is ordinary JS — except for the `__$c`/`__bc` blobs, which are a
  *small* embedded interpreter. So XHS is ~90% readable JS + ~10% data-driven core;
  TikTok is ~0% readable until the VM is modelled.

## C3. Inputs bound into the signature

| Input | TikTok | Xiaohongshu |
|---|---|---|
| Request URL (URI + query) | yes (strData/report path) | **yes** (`buildURL` → `sign(url, …)`) — confirmed |
| Request body | yes | **yes** (`sign(url, body)`) — confirmed |
| Cookie / device id | device/mstoken ids | **`a1`** cookie (+ `webId`/`gid`/`b1`/`p1`) — confirmed |
| Timestamp | `tspFromClient` (ms) | `x-t` ms timestamp — referenced |
| Envelope magic | `538969122` — confirmed in pool | — |
| Header outputs | `X-Bogus`, `X-Gnarly`, `msToken` — confirmed | `x-s`, `x-t`, `x-s-common` — confirmed (keys), build **referenced** |

Both bind URL + body + a persistent id + time. TikTok adds a fixed envelope magic;
XHS splits output across `x-s` (signature) and `x-s-common` (environment/device blob).

## C4. Fingerprinting surface

- **TikTok** (bootstrap subset, `data/tiktok_fingerprint_surface.json`): `navigator.connection`,
  `document.readyState`, `screen`, `performance`, `crypto`, Slardar telemetry, a bundled
  MD5 (`JS_MD5_NO_NODE_JS`) — a broad, telemetry-heavy surface.
- **Xiaohongshu** (`data/xhs_fingerprint_surface.json`): `document.cookie`,
  `document.documentElement.getAttribute` (the tamper check), `document.addEventListener`
  — a *narrow* surface up to the integrity gate.

Both surfaces are **partial** (each signer aborts headless before full fingerprinting),
a limitation shared by both case studies rather than a difference between them.

## C5. Randomness and time sources

- **Shared constant:** a Numerical-Recipes **LCG** increment — `1013904223` in TikTok's
  pool, `1013904243` concatenated into XHS's to-be-signed string. Both lean on a seeded
  LCG rather than only `crypto.getRandomValues`.
- **TikTok** also carries the golden-ratio `0x9E3779B9` (TEA family) and SHA-256 round
  constants in its pool.
- **Time:** both read millisecond wall-clock time (`Date.now`) and bind it into the
  signature (TikTok `tspFromClient`, XHS `x-t`).

## C6. Version drift / change cadence

- **TikTok: quantified.** The reference analysed core **1.12.2**; our capture is **1.16.6**.
  Across that gap the VM was *replaced* (stack→register, 77→365 opcodes, 272→351
  functions, JS string-array→in-VM pool, hard-coded bytes→base64+DEFLATE). Evidence:
  [analysis/tiktok/REPLICATION.md](tiktok/REPLICATION.md). This is strong evidence of a
  frequently and substantially re-engineered protection.
- **Xiaohongshu: qualitative only.** We pinned a single bundle (asset hash `bb0b0051`;
  no internal semver string found), so we **cannot quantify** its drift. We note the
  rebrand (`xiaohongshu.com` → `rednote.com`) and the modern obfuscator toolchain, but
  make no claim about cadence. (A second pinned bundle would be needed; deferred.)

## C7. Analysis difficulty

We did **not** log wall-clock hours, so we report *relative* effort by the tooling each
required rather than invented numbers:

| | TikTok | Xiaohongshu |
|---|---|---|
| New passes/tools needed | bytecode decoder, opcode-table builder, disassembler, string-pool decoder, harness (5) | string-array-eval pass, payload extractor, harness (3) |
| Hardest step | rebuilding a 365-opcode register VM from scratch | the encrypted `__$c`/`__bc` blobs + CFG flattening behind the integrity gate |
| Readable without new infrastructure | ~0% (all virtualized) | ~90% (after string-array pass) |
| Blocking wall | env init (headless bootstrap incomplete) | env-integrity check (`err:d93135`) |

**Relative verdict:** TikTok has a higher *up-front* cost (build the VM) but then yields
broad coverage (89.7% of the image disassembled, token→function map). Xiaohongshu is
*faster to first insight* (string pass → readable JS) but its crypto core is gated
behind an encrypted blob we chose not to fully reverse.

## C8. Lessons for defenders

1. **Virtualization vs obfuscation is a cost-shape choice, not a security level.** TikTok's
   VM resists *partial* understanding (nothing is readable until you build the
   interpreter); XHS's obfuscation resists *complete* understanding (most is readable,
   but the last 10% is encrypted data). Both were analysable to the level needed to
   describe the pipeline without a working signer.
2. **The real wall was the environment-integrity check, not the obfuscation.** Both
   signers abort headless. The deterrent that actually stopped end-to-end extraction was
   runtime tamper-detection, not code hiding — the cheaper and more durable control.
   Defenders get more per unit effort from binding signatures to hard-to-forge
   environment state than from heavier static obfuscation.
3. **Shared, well-known constants leak intent.** An LCG increment, `0x9E3779B9`, SHA-256
   K-constants, and MD5 tables are visible beacons that name the primitives before any
   deobfuscation. If the primitive inventory matters, it should itself be hidden
   (table-free implementations), not just wrapped.
4. **Version drift is the strongest defence we measured.** TikTok replaced its entire VM
   between two minor versions; any static signer would have broken. Frequent, structural
   rotation beats a single strong-but-static scheme.
5. **A principled analysis boundary is reproducible and safe.** We stopped at
   understanding and refused to defeat the integrity checks, because that crosses into
   building a signer. Defenders can rely on that boundary existing for good-faith
   researchers — and should assume bad-faith actors will not respect it, which again
   argues for runtime/environment binding over static hiding.
