# Hostile self-review of paper #2

Re-read as a skeptical reviewer trying to reject. Verdicts: **fixed**, **noted** (in
Limitations), **wontfix** (out of scope by design).

## Major

1. **"Your \observed tier is thin and one-sided --- SDK traffic only, no first-party,
   and nothing for TikTok. Is this a data-collection paper or a failure report?"**
   Fair challenge. --- **noted/reframed**: the paper leads with the *discipline* and the
   *stored-on-device* tier, not raw \observed volume. The asymmetry is stated in the
   abstract, Section VI, and Limitations. The first-party gap is explained by a verified
   five-layer hardening (Table II), which is itself a result, not an excuse.

2. **"\stored-on-device is not transmission. Are you implying XHS sends the reading
   history?"** No, and the paper says so twice (Section VI: "local persistence is not
   the same as transmission"; the queues are labelled upload *queues* = intent, not
   send). --- **fixed (framing)**. A reviewer could still argue the tier invites
   misreading; the explicit disclaimers mitigate it.

3. **"The CN-zone and jurisdiction points risk the exact overclaim you criticise."**
   The sharpest risk. --- **fixed**: Section VI states the access question as "subject to
   laws that could compel disclosure," explicitly says we did NOT observe first-party
   transmission to any destination, and does not claim China transmission as proven. The
   `zone=CN` is reported as a local default, which is what we saw.

4. **"Permissions-as-evidence is the very trap you open with."** --- **fixed**: \cancollect
   is a separate, clearly-weakest tier; the paper's whole structure exists to avoid
   conflation, and the intro names Internet~2.0 as the cautionary example.

## Medium

5. **"Tracker list is namespace-grep, not Exodus; could be false positives."** True; we
   disambiguated the biggest one (Facebook SDK vs React Native) but not all. --- **noted**
   in Limitations; labelled \hascode (code present), not \observed.

6. **"Single device, single session; n=1."** --- **noted**; this is a qualitative
   evidence-graded catalogue, not a population measurement, and says so.

7. **"TikTok has no dynamic tier at all --- why include it?"** For the \cancollect/
   \hascode comparison and because it shares XHS's resistant stack. --- **noted**; the
   paper is explicit that TikTok is static-only and does not claim otherwise.

8. **"Redaction: can you prove no personal value leaked?"** --- **fixed**: the redactor
   emits shapes only, records binary/compressed bodies as one opaque field, validates
   field-name tokens, and has a regression test asserting no synthetic raw value leaks;
   raw captures and DBs are git-ignored and verified absent from history (gitleaks).

## Minor

9. **"Clipboard 8-vs-2 DEX --- so what?"** It is a \hascode count, presented as such, not
   as "XHS reads your clipboard more." --- **fixed (framing)**.

10. **"Citations are NGO/vendor, not peer-reviewed."** The relevant prior art on these
    exact apps is NGO/vendor (Citizen Lab, EFF); they are verified real and correctly
    scoped. --- **noted**.

## Reviewer bottom line
The paper's strength is that it refuses to overclaim: every number sits at one evidence
level, the China question is stated as compellability not proven transmission, and the
one place it could mislead (stored-on-device) carries explicit disclaimers. Its weakness
is a thin first-party \observed tier, which it discloses and explains rather than papers
over. Accept as an honest, reproducible evidence-graded study; reject only if the venue
required population-scale dynamic measurement, which this is not.
