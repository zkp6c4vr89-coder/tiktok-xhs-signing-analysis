# Client-side request signing on TikTok and Xiaohongshu web: a reproducible study

> **Status:** work in progress (phase A0, repository scaffold). The results below are not filled in yet.

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
# 1. Put the pinned bundles listed in data/bundles.csv into samples/ (they are not distributed here).
# 2. Run the offline pipeline: deobfuscate -> disassemble -> trace -> figures.
make reproduce
```

`make verify-samples` checks the SHA-256 of each file in `samples/` against `data/bundles.csv`.

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

### Parts B, C — to be filled in at checkpoints B5 and C.

## Licence

Code is under the MIT licence ([LICENSE](LICENSE)). The paper and its figures are under CC BY 4.0 ([paper/LICENSE](paper/LICENSE)).

## Contact

Sreenandhu Nair, GitHub [@zkp6c4vr89-coder](https://github.com/zkp6c4vr89-coder). Please open an issue for questions or corrections.
