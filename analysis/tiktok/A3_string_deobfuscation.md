# A3: string deobfuscation — reproduction and a version-drift finding

Goal (from the brief): reproduce the reference's string deobfuscation with our own
Babel pass and compare against its output.

## What the reference did (1.12.2)

The reference removed a **JS-level string-array indirection**: literals in the
interpreter/loader code were hidden behind two global arrays accessed as `Kg[n]`
(strings) and `aa[n]` (numbers). Its `deobf/deobf.js` is a Babel `MemberExpression`
visitor that, when the object is `Kg`/`aa`, replaces the lookup with the literal from
the corresponding array (`t.valueToNode`). Example: `Kg[123]` -> `"navigator"`,
`aa[45]` -> `2654435769`.

## Our reusable pass

[tools/deobf/passes/string-array.js](../../tools/deobf/passes/string-array.js)
reimplements and generalises that technique so it is reusable on both platforms. It:

1. auto-detects a string/number array declaration (`var ARR = [ ... ]`, mostly
   literals, >= 20 elements by default);
2. optionally applies a rotation IIFE first, evaluated in an isolated `node:vm`
   sandbox, so the array is read in its post-rotation order;
3. auto-detects a decoder function `function dec(i){ return ARR[i - OFFSET]; }` and
   resolves its constant offset;
4. replaces both `ARR[n]` and `dec(n)` with concrete literals.

Tests ([tools/deobf/tests/string-array.test.js](../../tools/deobf/tests/string-array.test.js),
4 passing) cover direct indexing, decoder+offset indexing, the sandboxed rotation
case, and the no-array no-op. The fixtures are authored by us, because the reference
published only its *post*-deobfuscation `output.js` — there is no original obfuscated
input to diff against directly, so we reproduce the *technique* and verify it on a
fixture in the same shape, then run it on our pinned bundle.

Run it: `make deobf` (runs the tests, then applies the pass to the pinned bundle).

## Finding: the string-hiding technique changed between 1.12.2 and 1.16.6

Running the pass on our pinned capture (`webmssdk` core **1.16.6**) returns
`{arrayName:"a", decoderName:null, replacedArrayIndex:1, replacedDecoderCall:0}` — one
incidental substitution and no decoder. There is **no** global rotating string-array
driving the code. Direct static evidence on the bundle:

| Signal of the classic obfuscator string array | Count in 1.16.6 |
|---|---|
| `.shift()` (rotation) | 1 |
| `parseInt(` (rotation checksum) | 0 |
| all-string array literals >= 40 elements | 0 |
| `atob(` | 1 |

Instead, 1.16.6 carries its readable strings in two places:

1. **Inside the VM bytecode.** A single ~69 KB encoded literal at line 1
   (`"1L13vF5VlYC9zz335v..."`) holds the bytecode *and* its embedded string table. The
   strings are produced at runtime by the VM's own `decodestring` routine (the signed
   LEB128 / custom-UTF-8 decoder noted in A1), not by a JS array lookup. Recovering
   this table is therefore a job for the **bytecode parser in A4**, not for a Babel
   AST pass — the strings do not exist as JS literals at all until the VM runs.
2. **Small encoded constants.** e.g. a 260-char base64 literal that decodes to a
   repeating-key-XOR blob (the key `CsArachoi` leaks through its null-byte runs). These
   are incidental, not the main string store.

### Why this matters

The reference's Babel `MemberExpression` pass has **no target** in 1.16.6: the layer it
removed was deleted (or moved into the VM) in a later version. This is a concrete,
reproducible instance of **version drift changing the obfuscation surface**, and it
sets up Part A's method: in 1.16.6 the meaningful "string deobfuscation" is the VM
string-table extraction done by the parser in A4. The reusable pass still earns its
place — it is the correct tool whenever a JS-level string array *is* present (and we
will try it on the Xiaohongshu bundle in B3).

## Status for the replication table (A6)

- Claim "strings hidden behind JS-level arrays `Kg`/`aa`, removable by a Babel
  MemberExpression pass": **reproduced as a technique** (pass + tests), but **not
  applicable to 1.16.6** (the layer is absent). Evidence: this document, `make deobf`
  output, the signal table above.
