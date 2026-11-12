# Lab notebook

Dated entries: commands run, hypotheses, results, and dead ends. Times are local.

## 2026-11-12: A0, repository scaffold

- Environment: git 2.54.0, Node v25.9.0, Python 3.14.6, gh 2.103.3, latexmk available. tectonic, gitleaks, and trufflehog are not installed yet (they are needed in D and E).
- Created the layout from the project brief, plus `.gitignore` (samples/, private/, HAR and cookie files), the README with its disclaimer, MIT `LICENSE`, CC BY 4.0 `paper/LICENSE`, a `Makefile` skeleton with `verify-samples`, and an empty `data/bundles.csv`.
- Decisions confirmed with the owner: the repo is published from the `zkp6c4vr89-coder` account as `tiktok-xhs-signing-analysis` (public); the author is Sreenandhu Nair; browser use is allowed for logged-out page and bundle capture at human pace, with no API calls.

## 2026-11-12: A1, read the reference repo

- Cloned notemrovsky/tiktok-reverse-engineering into samples/reference/ (git-ignored; not redistributed). Pinned commit 0f8b7046 (2026-07-13).
- Read README + disasm.js + bytearray.js in full; surveyed deobf/ and debug_asf/. Did NOT execute any of its code.
- Wrote notes/tiktok_reference.md summarising: stack-VM architecture (registers v/l/c/a/f/d/g), string deobf via Babel MemberExpression replacement over two arrays, bytecode parser fetchInstructions (confirmed blabla = signed LEB128 varint; decodestring = custom UTF-8 decoder), the disassembler emitting vm0..vm271, and the runtime-trace result vm249=X-Gnarly / vm103=X-Bogus / vm42=strData.
- FINDINGS to carry into A4/A5:
  1. README claims "77 opcodes" but disasm.js implements only 66 (switch cases). Missing in 0..75: 19,25,31,46,56,59,68,69,70,73. Two of these (19 TRY, 31 JUMP_IF_TRUE) are named in the README's OWN control-flow table yet absent from the disassembler. "77" is an opcode-space estimate; 66 are actually mapped. Reconcile in A4.
  2. Function count 272 (vm0..vm271) confirmed by directory listing.
  3. Primitive leads: aa[45]=2654435769=0x9E3779B9 (golden-ratio constant, TEA/XXTEA family); vm103 contains "d41d8cd98f00b204e9800998ecf8427e" = MD5(""), so X-Bogus path likely uses MD5.
- Naming: author's array identifiers are slurs; redacted to ARR_STR (Kg[...]) / ARR_NUM (aa[...]) throughout. Will never appear in the public repo.
