# A6: TikTok replication — claim-by-claim

Each row is a claim from the reference analysis
([notemrovsky/tiktok-reverse-engineering](https://github.com/notemrovsky/tiktok-reverse-engineering),
pinned commit `0f8b7046`), our reproduction verdict against our **own** pinned bundle
(webmssdk core **1.16.6**, `data/bundles.csv`), the evidence path, and notes. The
reference analysed **1.12.2**; the four-minor-version gap is the reason for most
differences, and is itself the headline finding.

Verdicts: **Reproduced** · **Reproduced-different** (same phenomenon, different form due
to version) · **Technique-only** (method reproduced, not applicable to 1.16.6) ·
**Unverified**.

| # | Reference claim | Verdict | Evidence | Notes |
|---|---|---|---|---|
| 1 | Client code is a bytecode VM protecting the signing logic | **Reproduced** | [A4_vm.md](A4_vm.md); `data/tiktok_opcodes_1.16.6.json` | Confirmed; a VM is present in 1.16.6 too. |
| 2 | VM is a **stack** machine with a `switch` dispatcher | **Reproduced-different** | [A4_vm.md](A4_vm.md) | 1.16.6 is a **register** machine with a **handler-table** dispatch (`d[f]`), 16-bit opcodes. Design changed between versions. |
| 3 | **77 opcodes** | **Reproduced-different** | `data/tiktok_opcodes_1.16.6.json` (365 rows) | We count **365** opcodes in 1.16.6 (reference's own disassembler implements 66, not 77). More, and many are specialised whole-function handlers. |
| 4 | **272** VM functions (`vm0…vm271`) | **Reproduced-different** | `data/tiktok_function_entries_1.16.6.json`; [A4_vm.md](A4_vm.md) | We discover **351** functions (206 constant entry seeds + children); 245 return cleanly; 89.7% byte coverage. |
| 5 | String literals hidden behind JS-level arrays, removed by a Babel `MemberExpression` pass | **Technique-only** | [A3_string_deobfuscation.md](A3_string_deobfuscation.md); `tools/deobf/` (4 tests) | The JS-level array layer is **absent** in 1.16.6. We built and tested the pass; it has no target here. Strings moved into the VM. |
| 6 | Bytecode parsed by a varint/`fetchInstructions` reader; decompression skipped | **Reproduced-different** | [tools/vm/decode.js](../../tools/vm/decode.js); A4 | 1.16.6 bytecode = **base64 → raw DEFLATE** (98,961 bytes). We implement the decompression the reference hard-coded around. Opcodes are read as uint16, operands via 1/2/3-byte readers. |
| 7 | Disassembler emits per-function files | **Reproduced** | [tools/vm/disasm.js](../../tools/vm/disasm.js); [disasm_samples/](disasm_samples/) | Our recursive-descent disassembler emits per-function disassembly with coverage reporting. |
| 8 | Strings decoded by a custom decoder at runtime | **Reproduced** | [A5_tracing.md](A5_tracing.md); `tools/vm/strings.js`; harness decode hook | 1.16.6 decoder is `l(n,t)` = base64 + repeating-key XOR over pool `A`; confirmed by recovering correct plaintext at runtime. |
| 9 | Runtime tracing identifies token functions: **vm103=X-Bogus, vm249=X-Gnarly, vm42=strData** | **Reproduced-different** | [A5_tracing.md](A5_tracing.md); `data/tiktok_token_map_1.16.6.json` | We locate X-Bogus (A[686]) at fn@70647/71583/72103/72253, X-Gnarly (A[688]) at fn@73223, both assembled at fn@61636. Different offsets/structure (version); same tokens. **strData** not located in 1.16.6 (unverified), though its magic 538969122 is present. |
| 10 | Pipeline uses MD5 (vm103 holds MD5-of-empty-string) | **Reproduced** | [A5_tracing.md](A5_tracing.md); `JS_MD5_NO_NODE_JS` in fingerprint surface | MD5 evidenced via the bundled MD5 library flag seen at runtime. |
| 11 | Signing primitives include hashing/mixing with constant `0x9E3779B9` | **Reproduced** | `data/tiktok_opcodes_1.16.6.json` pool `y` (A4) | `0x9E3779B9` present, plus SHA-256 round constants, FNV-1 offset/prime, and an LCG increment — a broader primitive set than the reference described. |
| 12 | Exact end-to-end signature pipeline (byte-level composition of X-Bogus) | **Unverified** | [A5_tracing.md](A5_tracing.md) Limitations | We inventory the primitives and the producing functions but did not produce a signature headless, so the exact composition order is not traced. Honest gap. |

## Summary

- **Reproduced:** 5 (rows 1, 7, 8, 10, 11)
- **Reproduced-different (version drift):** 5 (rows 2, 3, 4, 6, 9)
- **Technique-only:** 1 (row 5)
- **Unverified:** 1 (row 12), plus the strData sub-claim in row 9.

The central result: the reference's method **reproduces**, but the artefact it targeted
(the 1.12.2 stack VM with 77 opcodes, 272 functions, and a JS-level string array) has
been **replaced** in 1.16.6 by a register VM with 365 opcodes, 351 functions, base64+
DEFLATE bytecode, and an in-VM base64/XOR string pool. Same platform, same tokens
(X-Bogus, X-Gnarly), substantially re-engineered protection.
