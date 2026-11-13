# Hostile self-review of the paper

Re-read as a skeptical program-committee reviewer who wants to reject. Each weakness is
listed with a verdict: **fixed** (addressed in the paper/repo), **noted** (acknowledged
in Limitations, not fully fixable here), or **wontfix** (out of scope by design).

## Major

1. **"You never produced a signature, so how do you know the token→function map is
   right?"** Fair. The map is from static operand analysis of our own disassembly, not
   from observing a live X-Bogus. — **noted**: stated explicitly in Section VIII and the
   abstract; the map identifies functions that *reference* each header name, which is a
   weaker claim than "produces," and the paper now says so in both places.

2. **"MD5/RC4 are asserted as the primitives but not demonstrated."** Correct and
   important. — **fixed (framing)**: every primitive is tagged "confirmed" vs
   "referenced" in the taxonomy table and the pipeline figure caption; MD5 is
   "referenced, not byte-confirmed" on both platforms; RC4/custom-alphabet is "not
   independently confirmed" for XHS. No primitive is stated as fact without that marker.

3. **"The TikTok 'replication' compares against a different version, so it isn't a
   replication."** Partly fair. — **noted/fixed**: reframed as the central *finding*
   (the VM was replaced), not hidden. We state we could not obtain the 1.12.2 bundle
   (no longer served) and that the cross-version comparison relies partly on the
   reference's pasted source. The method is replicated even though the artefact changed.

4. **"89.7% coverage — what's in the missing 10%, and could the desynced functions
   change your conclusions?"** — **noted**: the 106 desyncs are from not following the 33
   in-function jump opcodes; this is in Limitations as tractable future work. Our
   conclusions (opcode/function counts, token map) do not depend on the desynced tail,
   since the token-bearing functions returned cleanly.

5. **"Opcode categories are heuristic; the count of 365 could be inflated by
   mislabelling."** The *count* (365) is exact (array length) and independent of the
   category labels; only the category *breakdown* is heuristic. — **fixed**: the paper
   separates these ("the count is exact; categories are heuristic labels").

## Medium

6. **"Single XHS bundle — the 'version drift' comparison is lopsided."** True. —
   **fixed (honesty)**: Section VII says TikTok drift is quantified and XHS drift is
   *not* claimed (single bundle); we make no XHS cadence claim.

7. **"Fingerprint surfaces are tiny (3 paths for XHS) — is that really the surface?"**
   No; it is the bootstrap subset before the integrity check aborts. — **fixed**:
   labelled as partial in the text, the figure, and the appendix.

8. **"No wall-clock effort data, despite a 'difficulty' section."** — **fixed**: we
   explicitly decline to invent hours and report *relative* effort by tools built.

9. **"Related work is thin on request-signing specifically."** Fair; the academic
   literature on commercial request-signing is sparse, so we lean on virtualization-
   obfuscation and fingerprinting. — **noted**: acknowledged; the community repo is the
   closest prior art and is cited.

10. **"The paper is short for its claimed scope."** — **noted**: it is dense
    (two-column, 10pt) and every claim is backed; we chose concision over padding. The
    appendices carry the reproducibility detail.

## Minor

11. **"Is the harness's determinism real, or does nondeterminism leak in?"** Date and
    Math.random are overridden; crypto.getRandomValues is seeded. — **fixed** in
    `tools/harness/env.js`; noted that full determinism past the integrity check is
    untested because the signer aborts.

12. **"\`strData\` claim dangling."** — **fixed**: stated as not located in 1.16.6 (its
    magic constant is present), marked unverified rather than dropped.

## Reviewer's bottom line

The work is honest about its ceiling (no signature produced) and does not overclaim.
The strongest results — the VM reconstruction, the version-replacement finding, and the
virtualization-vs-obfuscation contrast — stand on reproducible tooling. The weakest
points (unconfirmed primitives, partial coverage, one-sided XHS drift) are disclosed
rather than buried. Accept with the caveat that the title should not imply a complete
signature reversal; the current title ("...Virtualization versus Obfuscation") does not.
