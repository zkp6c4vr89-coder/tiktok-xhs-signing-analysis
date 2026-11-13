# Client-side request signing on TikTok and Xiaohongshu web: a reproducible study

> **Status:** v1.0. Paper: [paper/main.pdf](paper/main.pdf) (8 pages). Secret-scanned over full history (gitleaks, clean); no bundles, signer, credentials, or personal data in the repo or its history.

This repository studies the client-side request-signing code that two social platforms ship to web browsers:

- **Part A, TikTok web.** An independent replication of the bytecode-VM analysis in
  [notemrovsky/tiktok-reverse-engineering](https://github.com/notemrovsky/tiktok-reverse-engineering)
  (X-Bogus, X-Gnarly, strData).
- **Part B, Xiaohongshu (RedNote) web.** The same method applied to the `x-s` request signature.
- **Part C.** A comparison of the two systems.
- **Part D.** A paper written up from the evidence in this repository.

What this project contributes is an understanding of how these systems work, plus analysis tooling that can be reused (Babel deobfuscation passes, a VM disassembler, and a logging environment harness). It is **not** a way to access either platform.

## Disclaimer

- This is educational and security research. It has **no affiliation** with TikTok, ByteDance, Xiaohongshu, or any related company.
- **No signer is released.** The repository contains algorithm descriptions, diagrams, test vectors, and pass/fail results. It contains no code that produces valid signatures.
- **No platform bundles are redistributed.** The analysed JavaScript belongs to its owners. We publish only SHA-256 hashes, retrieval dates, URLs ([data/bundles.csv](data/bundles.csv)), and the short excerpts needed to explain a point.
- No credentials, cookies, device identifiers, or personal data are included. All analysis runs offline against saved copies.

## Repository layout

| Path | Contents |
|---|---|
| `paper/` | LaTeX source, figures, and the built PDF |
| `tools/deobf/` | Babel deobfuscation passes, one file per technique, each with tests |
| `tools/vm/` | Bytecode parser, disassembler, opcode tables |
| `tools/harness/` | Node runner and a logging Proxy environment shim |
| `analysis/tiktok/`, `analysis/xhs/` | Traces, disassembly, notes per platform |
| `data/` | `bundles.csv` (pinned inputs), `test_vectors/`, fingerprint surfaces |
| `notes/LOG.md` | Dated lab notebook |
| `samples/`, `private/` | Git-ignored: raw bundles, captures, validation-only code |

## Reproducing

```sh
# 1. Put the pinned bundles listed in data/bundles.csv into samples/ (not distributed here).
#    For TikTok the pipeline also expects a beautified copy + decoded bytecode, which
#    `make disasm` regenerates from the raw bundle.
# 2. Run the offline pipeline: verify -> deobfuscate -> disassemble -> trace -> xhs -> figures.
make reproduce      # full offline pipeline from samples/
make test           # unit tests (9: deobf + vm)
make -C paper       # or: cd paper && latexmk -pdf main.tex   (builds the PDF)
```

`make verify-samples` checks the SHA-256 of each file in `samples/` against `data/bundles.csv`. Individual stages: `make deobf`, `make disasm`, `make trace`, `make xhs`, `make figures`.

## Results

### Part A — TikTok replication (complete)

The reference analysed webmssdk **1.12.2**; we pinned the current **1.16.6**. The
method reproduces, but the protected artefact was re-engineered between versions.

| Property | Reference 1.12.2 | Ours 1.16.6 |
|---|---|---|
| VM style | stack machine, `switch` | register machine, handler table `d[f]` |
| Opcode width / count | 1-byte, 77 (66 in its disassembler) | 16-bit, **365** |
| VM functions | 272 | **351 discovered** (89.7% byte coverage) |
| Bytecode delivery | hard-coded array | base64 → raw DEFLATE (98,961 bytes) |
| String hiding | JS-level array (Babel-removable) | in-VM base64 + XOR pool |
| X-Bogus / X-Gnarly | vm103 / vm249 | fn@70647… / fn@73223 (assembled at fn@61636) |

Claim-by-claim table: [analysis/tiktok/REPLICATION.md](analysis/tiktok/REPLICATION.md)
(5 reproduced, 5 reproduced-different by version drift, 1 technique-only, 1 unverified).
Reproduce with `make verify-samples && make deobf && make disasm && make trace`.

### Part B — Xiaohongshu / RedNote `x-s` (complete)

The signer is reached via `window.sign(url, body)` → `{x-s, x-t, x-s-common}` (inputs: URL, body, `a1` cookie, timestamp). Unlike TikTok's bytecode VM, it is a **`javascript-obfuscator` payload** (string array + control-flow flattening) over two **encrypted data blobs** — recovered with a reusable evaluating deobfuscation pass (297 decoder calls resolved). Details: [analysis/xhs/](analysis/xhs/).

**No valid `x-s` test vectors were produced.** The signer aborts headless on an environment-integrity check; defeating it would cross into building a working signer, which this project does not do. See [data/test_vectors/xhs.json](data/test_vectors/xhs.json).

### Part C — comparison (complete)

TikTok **virtualizes** (bespoke 365-opcode register VM); Xiaohongshu **obfuscates** ordinary JS over encrypted blobs. Both bind URL + body + a persistent id + timestamp, share a Numerical-Recipes LCG constant, and — the key finding — are blocked from headless signing by a **runtime environment-integrity check, not by the obfuscation**. Full analysis: [analysis/COMPARISON.md](analysis/COMPARISON.md).

## Licence

Code is under the MIT licence ([LICENSE](LICENSE)). The paper and its figures are under CC BY 4.0 ([paper/LICENSE](paper/LICENSE)).

## Contact

Sreenandhu Nair, GitHub [@zkp6c4vr89-coder](https://github.com/zkp6c4vr89-coder). Please open an issue for questions or corrections.
