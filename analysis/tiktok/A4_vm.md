# A4: the webmssdk 1.16.6 VM — our independent reconstruction

Goal (from the brief): rewrite the dispatcher into a readable interpreter, build the
opcode table, bytecode parser, and disassembler; report opcode and function counts
vs the reference's 77 and 272 and explain any difference.

Reproduce with `make disasm` (runs the VM tests, then
[tools/vm/pipeline.js](../../tools/vm/pipeline.js) over the pinned bundle).

## Headline: 1.16.6 ships a different VM generation than the reference's 1.12.2

| Property | Reference (1.12.2) | Our capture (1.16.6) |
|---|---|---|
| VM style | stack machine | **register machine** (register file `u.o`) |
| Dispatch | `switch` on a 1-byte opcode | **handler table** `d[f]`, `f` a **16-bit** opcode |
| Opcodes | **77** (66 actually in its disassembler) | **365** |
| Bytecode delivery | hard-coded `Uint8Array` (decompression skipped) | **base64 → raw DEFLATE**, 98,961 bytes |
| String table | embedded, custom UTF-8 decoder | base64 + **repeating-key XOR** pool (`l(n,t)`) |
| Functions | **272** (`vm0…vm271`) | **351 discovered** (206 seed entries + children) |

These are not cosmetic version bumps: the dispatch mechanism, opcode width, register
model, bytecode packaging, and string encoding all changed. The reference's stack-VM
disassembler does not apply to 1.16.6; we built a new one. This is the central Part A
result — **version drift replaced the protection VM**, so "replication" here means
reproducing the *method* and reaching an equivalent understanding of the new VM, which
we did.

## The VM, in our own terms

Interpreter entry `S(start, thisArg, args, ctx, _, L)` sets up a frame `u`:

- `u.o` — register file. `u.o[0..6]` preloaded: `null, undefined, true, false, w
  (return sentinel), args, ctx`. `u.L` is the boundary above which registers are
  boxed cells `{v: …}` (closure variables).
- `u.I` — program counter (byte offset into the decompressed bytecode `g`).
- `u.A` — try/handler stack; `u.O` — exception/operand stack.
- Loop: `while (u.I < g.length && C(u,4) === w) { f = (g[I++]<<8)|g[I++]; d[f](u); }`
  — read a 16-bit opcode, call its handler. A function **returns** by writing register
  4 (the sentinel slot), which breaks the loop; its value is `C(u,4)`.

Operand readers (advance `u.I`): `O` = 1 byte, `p` = 2 bytes (uint16), `m` = 3 bytes
(uint24). Register access: `C`/`L` get, `Q`/`I` set, `U` post-increment, `P` box.
Strings: `l(n,t)` = base64-decode `n` then XOR with repeating key `t`
(pool `A`, keys are other pool entries). Numbers: pool `y`.

### Opcode table (365 entries)

[data/tiktok_opcodes_1.16.6.json](../../data/tiktok_opcodes_1.16.6.json) — one row per
opcode with its operand-read sequence (hence encoded length), a variadic flag, a
terminal flag (writes the return register), a setsPC flag (in-function jump), and a
coarse heuristic category. Category breakdown:

`call 93, store 56, arith 53, compare 41, construct 33, bitwise 30, array 29, make-function 9, other 13, load 5, control/exception 3`.

Two observations explain why there are 365 (not 77):

1. **Specialised / super-instruction handlers.** Many opcodes are whole bespoke
   functions with constant data baked in — e.g. op20 runs `S(97760,…)` then returns,
   op326 probes `Object.getOwnPropertyNames(window)`. 99 opcodes are *terminal* (they
   write the return register), i.e. they inline an entire function body. The compiler
   emitted one handler per operation *shape it saw*, so the opcode count reflects the
   program, not a fixed ISA.
2. **Fused multi-operand opcodes.** Operand counts run up to ten 2-byte reads, so a
   single opcode can encode a multi-term expression. This is heavier obfuscation than
   the 1.12.2 one-op-per-primitive design.

### Functions (351)

Function entries come from two places: constants passed to `S(const, …)` inside
specialised handlers (**206** distinct seed offsets, spanning the whole image), and
3-byte (`m`) operands on the 9 make-function opcodes (read from the bytecode at
runtime). Recursive-descent from the seeds, following discovered children, reaches
**351 functions**; **245 return cleanly**, 106 desync. Coverage of the 98,961-byte
image is **88,772 bytes (89.7%)**.

The 106 desyncs are an honest limitation, not a contradiction: our disassembler is a
linear sweep per function and does not yet follow the 33 in-function jump opcodes
(`setsPC`), so a function with internal branches can misalign after a backward/forward
jump. Modelling jump targets would raise coverage; it is listed in Limitations and is
not needed for the A5 pipeline tracing, which follows data flow, not every branch.

### Primitives named by the constant pool `y` (lead for A5)

`y` begins: `4294967295 (0xFFFFFFFF), 2654435769 (0x9E3779B9, TEA/XXTEA),
7.776e9, 3735928559 (0xDEADBEEF), 0.1…1.5, 538969122 (the strData magic),
2147483648, 2166136260 & 16777619 (FNV-1 offset/prime), 1013904223 (Numerical-Recipes
LCG increment), 4294967296, 1116352408, 1899447441, 3049…(SHA-256 round constants K)`.
So the signing pipeline is expected to combine **SHA-256, FNV-1, an LCG PRNG, a
TEA-family mix, and MD5** (the MD5-of-empty-string constant from the reference's
vm103). A5 will confirm which of these actually feed X-Bogus / X-Gnarly.

## Tooling (reusable)

- [tools/vm/decode.js](../../tools/vm/decode.js) — base64 + raw-DEFLATE bytecode loader.
- [tools/vm/build_opcode_table.js](../../tools/vm/build_opcode_table.js) — extracts the
  handler table, classifies operands (AST-based variadic test), emits the opcode table.
- [tools/vm/disasm.js](../../tools/vm/disasm.js) — linear and recursive-descent
  disassembler with coverage reporting.
- [tools/vm/pipeline.js](../../tools/vm/pipeline.js) — the end-to-end offline run.
- Tests: [tools/vm/tests/vm.test.js](../../tools/vm/tests/vm.test.js) (3 passing).

Example disassemblies: [analysis/tiktok/disasm_samples/](disasm_samples/) (entry
function and two leaf functions). Full per-function output is regenerated into
`samples/` (git-ignored) by `make disasm`.
