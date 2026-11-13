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

## 2026-11-12: A2, capture and pin the bundle

- Reference pinned no hash/URL; it pasted deobfuscated source. Extracted the version it analysed from that paste: webmssdk core dr="1.12.2" (slardar __version__ 2.11.0).
- Discovery: logged-out `curl` GET of https://www.tiktok.com/ and /explore -> both reference one SDK: .../webmssdk/1.0.0.417/webmssdk.js. (2 static GETs, generic UA, no cookies.)
- Captured to samples/webmssdk.1.0.0.417.js. SHA-256 6625c4fd90012eb2b6166002b278ac99ba2a2495325590f8eda9071544a814c8, 243702 bytes. Internal core version in THIS file: dr="1.16.6".
- FINDING (version drift): reference core 1.12.2 vs current 1.16.6 (4 minor versions). Documented in analysis/tiktok/bundle_capture.md. Replication targets our pinned 1.16.6; reference's 1.12.2 survives as pasted source for cross-version comparison.
- Pinned in data/bundles.csv; `make verify-samples` -> OK. Confirmed samples/*.js is git-ignored (git check-ignore hit; git status shows only bundles.csv + notes staged).
- Sanity: msToken/mssdk plaintext present; X-Bogus/X-Gnarly absent as plaintext (encoded in string array, as expected).

## 2026-11-12: A3, string deobfuscation

- Built reusable Babel pass tools/deobf/passes/string-array.js (auto-detect array + decoder+offset, optional sandboxed rotation, replaces ARR[n] and dec(n)). 4 unit tests pass (direct, decoder+offset, rotation, no-op). Wired `make deobf`.
- Inspected the 1.16.6 bundle structure (scratchpad scripts): no all-string array >=40 elems; .shift() x1, parseInt( x0, atob( x1 => NO classic rotating string-array obfuscator.
- Strings live in (1) the ~69KB encoded bytecode blob at line 1 (decoded at runtime by the VM's decodestring; recovered in A4, not by an AST pass) and (2) small encoded constants (a 260-char base64 -> repeating-key XOR blob, key "CsArachoi" leaks via null runs; binary, not the main store).
- Running the pass on 1.16.6: {arrayName:"a",decoder:null,replacedArrayIndex:1} => no JS-level string-array layer. 
- FINDING: the JS-level string-array layer the reference removed (Kg/aa) is ABSENT in 1.16.6 — version drift changed the obfuscation surface. Technique reproduced; not applicable to this version. Documented in analysis/tiktok/A3_string_deobfuscation.md. Will retry the pass on XHS in B3.

## 2026-11-12: A4, VM reconstruction

- Found the VM core at dispatch `d[f](u)` (beautified line 7754). 1.16.6 VM is architecturally DIFFERENT from reference 1.12.2:
  - register machine (register file u.o), 16-bit opcodes, handler-table dispatch d[f] (not a switch on 1-byte opcodes / stack machine).
  - bytecode = base64 -> raw DEFLATE (zlib.inflateRaw), 98961 bytes. Decoded via tools/vm/decode.js (reference had skipped decompression by hardcoding bytes). bytecode sha256 542a2a47...
  - operand readers O=1B, p=2B(uint16), m=3B(uint24); register access C/L get, Q/I set, U postinc, P box. return = write register 4 (sentinel w). strings: l(n,t)=base64+repeating-XOR pool A; numbers pool y.
- Built tools/vm: build_opcode_table.js (AST-based operand/variadic/terminal/setsPC classification), disasm.js (linear + recursive-descent w/ coverage), pipeline.js (end-to-end). 3 vm tests pass. Wired `make disasm`.
- COUNTS: opcodes = 365 (ref 77; ref disasm actually 66). functions discovered = 351 (206 constant S() seed entries + operand-driven children), 245 return cleanly, 106 desync. coverage 88772/98961 = 89.7%.
  - 99 opcodes are terminal (inline a whole function) => specialised/superinstruction VM explains 365 vs 77. operand counts up to 10x uint16 (fused expressions).
- desyncs (106) = disasm doesn't follow the 33 in-function jump (setsPC) opcodes yet. Honest limitation; not needed for A5 data-flow tracing.
- PRIMITIVE LEADS from numeric pool y: 0x9E3779B9 (TEA), 538969122 (strData magic), 16777619/2166136260 (FNV-1), 1013904223 (LCG), SHA-256 round constants K[], + MD5 (from ref). Confirm in A5.
- Wrote analysis/tiktok/A4_vm.md. Committed opcode table + function entries to data/, 3 sample disasms + coverage summary to analysis/tiktok/.

## 2026-11-12: A5 + A6, tracing and replication table

- Built reusable harness: tools/harness/env.js (logging-Proxy browser shim, synthetic/deterministic, no net/no real data) + run_tiktok.js (injects hooks on decoder l(n,t) and dispatch d[f](u), runs bundle in node:vm). `make trace`.
- Run: 8884 dispatches / 89 opcodes before headless boot stops (missing browser APIs; no signature produced). Decoder hook recovered correct strings (base62 alphabet, Math/imul/TextEncoder...) -> confirms base64+XOR model. Fingerprint surface (bootstrap subset, 29 paths) -> data/tiktok_fingerprint_surface.json. JS_MD5_NO_NODE_JS seen => MD5 lib present.
- Token recovery (tools/vm/strings.js): brute-decode pool A keeping EXACT matches -> A[685]=msToken, A[686]=X-Bogus, A[688]=X-Gnarly, A[753]=X-MS-STUB, A[754]=X-MS-PAYLOAD, A[1032]=/web/report.
- Token->function via disasm operand scan -> data/tiktok_token_map_1.16.6.json: X-Bogus fn@70647/71583/72103/72253, X-Gnarly fn@73223, all headers assembled at fn@61636. (Reference: single vm103/vm249 — structure differs by version.)
- strData: NOT located as a pooled string in 1.16.6 (magic 538969122 IS in pool y). Unverified.
- Primitives (pool y + MD5): MD5, SHA-256 (round consts K), FNV-1 (16777619/2166136260), LCG (1013904223), TEA (0x9E3779B9), envelope magic 538969122. Exact composition NOT traced end-to-end (no headless signature) — honest limitation.
- Wrote analysis/tiktok/A5_tracing.md and the A6 claim table analysis/tiktok/REPLICATION.md (5 reproduced, 5 reproduced-different, 1 technique-only, 1 unverified). PART A checkpoint.

## 2026-11-12: B1, Xiaohongshu x-s recon

- xiaohongshu.com -> 302 rednote.com (rebrand) -> login wall, but serves public PC-web bundles at fe-platform-s10.rednotecdn.com/formula-static/xhs-pc-web/.../js/. Captured & pinned 4 bundles (bundler-runtime, index, vendor, vendor-dynamic). 
- /as/v1/ anti-spam modules 403 without referer. Did NOT spoof headers (bot-check circumvention; classifier-blocked and correct to avoid). Unnecessary: signer is in vendor-dynamic.
- CONTRACT (from axios interceptor in vendor-dynamic): l=window.sign(u,e.data); u=buildURL(uri,query); merged into headers via Object.assign -> x-s/x-t/x-s-common. _webmsxyw = newer signer ("sign_new" vs "sign_old"); window.f() adds device headers. Inputs: url, body, a1 cookie (+webId/gid/b1/p1), timestamp (Date.now). 
- SIGNER FORM: embedded as a 287,204-char string literal starting `var _0x5ae8=['doeZk',...]` = classic javascript-obfuscator string array (NOT a bytecode VM). Primitives: MD5, atob(base64), unescape, charCodeAt/fromCharCode. => My A3 string-array pass should apply here (it had no target on TikTok).
- KEY COMPARATIVE FINDING (Part C): TikTok = bytecode VM; XHS = string-array/CFG JS obfuscation. 
- vendor-dynamic sha256 25e31f6b... pinned. Wrote analysis/xhs/B1_recon.md.

## 2026-11-13: B2-B5, Xiaohongshu harness/deobf/algorithm/vectors

- Extracted embedded signer payload (288347 chars) from vendor-dynamic via tools/deobf/extract_xhs_payload.js -> samples/xhs/signer_payload.js (eval'd in bundle).
- B3 deobf: built reusable tools/deobf/passes/string-array-eval.js (javascript-obfuscator decoder: structural decoder detection, transitive alias resolution [40 aliases], sandbox-eval prelude, replace literal-arg calls). 297 calls resolved. 2 tests pass (6 deobf tests total). Decoder=_0xc8b2 aliased _0xe762c0. Remaining layers: variable-index decoder calls, control-flow flattening, encrypted hex blobs __$c/__bc (data-driven mini-interpreter).
- B2 harness (tools/harness/run_xhs.js, make xhs): payload loads, defines signer glb["_AUuXfEG27Xa3x"](a,b,c) + ~20 hash-named helpers. Fingerprint reads before abort: document.cookie, document.documentElement.getAttribute (automation/tamper check), document.addEventListener -> data/xhs_fingerprint_surface.json.
- B5: signer _AUuXfEG27Xa3x throws env-integrity error "err:d93135" headless (reads documentElement.getAttribute first). NO valid x-s vectors produced. Did NOT defeat the check (approaches building a signer; keep out of public repo). data/test_vectors/xhs.json documents inputs + the reachable partial helper output [0,"<url>1013904243"] (NOT a signature) + pass_rate N/A. Honest per rule 5.
- B4 algorithm (static+partial): contract window.sign(url,body)->{x-s,x-t,x-s-common}; to-be-signed string = url + LCG const 1013904243; primitives MD5 (referenced, magic consts NOT plaintext -> in __$c/__bc or computed), base64(atob) confirmed, unescape/fromCharCode. RC4/custom-alphabet (older public claim) NOT independently confirmed on this 2026 bundle. analysis/xhs/B2_B3_B4_analysis.md.
- COMPARATIVE (Part C seed): TikTok=bytecode VM; XHS=js-obfuscator string-array + CFG flattening + encrypted data blob. Both block headless signing via env checks. Shared LCG constant ~1013904223/43.

## 2026-11-13: Part C, comparative analysis

- Wrote analysis/COMPARISON.md. Dimensions: obfuscation taxonomy, VM-vs-flattened-JS, inputs bound, fingerprint surface, randomness/time, version drift, difficulty, lessons for defenders.
- Decision (with owner): dropped B6 x-s-common/x-rap-param (same env-check wall, runtime-capped). Skipped XHS 2-version diff (no 2nd bundle pinned) -> XHS drift noted QUALITATIVELY only; TikTok drift QUANTIFIED (1.12.2 vs 1.16.6). Stated honestly in C6.
- Carried confidence markers up: MD5 referenced (not byte-confirmed), base64 confirmed, RC4/custom-alphabet NOT confirmed on 2026 bundle. No invented hours (effort reported relatively, by tooling needed).
- Key shared finding: LCG increment 1013904223 (TT) / 1013904243 (XHS); both bind url+body+id+time; both blocked headless by env-integrity checks (the real wall, not obfuscation).

## 2026-11-13: Part D, the paper

- Verified 8 real citations via web search (Collberg TR148 1997, Skolka WWW2019, Rolles WOOT2009, Sharif S&P2009, Yadegari S&P2015, Eckersley PETS2010, Nikiforakis S&P2013, Laperdrix TWEB2020) + the reference repo. refs.bib + inline thebibliography. No invented refs.
- paper/figures/make_figures.py (matplotlib) generates fig_opcode_categories.pdf + fig_coverage.pdf from data/. VM architecture + both pipelines as TikZ. Full 12-row replication claim table.
- paper/main.tex: IEEEtran two-column, sections Abstract..Conclusion + appendices (bundles, opcode encoding, fingerprint surfaces, tool catalogue). Builds with latexmk -> main.pdf, 5 pages, 0 undefined refs/citations. Every number traces to repo (365/351/89.7%/pool indices etc.).
- Hostile self-review -> notes/REVIEW.md (12 issues; fixed: primitive confidence markers, exact-vs-heuristic opcode count, single-bundle honesty, partial fingerprint labelling, relative effort; noted in Limitations: no signature produced, coverage 89.7%, strData unverified).
- NOTE: paper is 5 dense IEEEtran pages, below the brief's 10-14 target. Chose not to pad (review item 10). Content is complete + evidence-backed. Can expand with more real detail if owner wants.

## 2026-11-13: Part D addendum (worked example + full opcode appendix)

- Added worked end-to-end trace to Section V: fn@61636 off 62053 bytes "01 20 02 ae 00 05..." -> op288 operand 0x02ae=686 -> A[686]="PVgnJSUPHg==" base64+XOR key A[5]="eueJBzmo" -> "X-Bogus". Fully reproducible via tools/vm.
- Added full 365-opcode appendix: paper/figures/make_opcode_table.py -> paper/opcode_table.tex (longtable, 4-up, onecolumn). Wired `make figures`.
- Paper now 8 pages, 0 undefined. Dropped the 10-14 page target per owner (short workshop-length is legitimate; no padding). Skipped expanded related-work and deep constant-pool analysis (latter risks upgrading "MD5 referenced" to "confirmed" — kept strict).

## 2026-11-13: Part E, publish — PROJECT COMPLETE

- Secret scan: gitleaks 8.30.1 over FULL history (13 commits) -> no leaks. History check: 0 samples/ or private/ files ever committed. No platform bundle tracked (only 16 tooling .js).
- README finalized: v1.0 status, PDF link, Parts A/B/C results, disclaimer, reproduce (make reproduce exits 0), contact.
- Topics: reverse-engineering, javascript-deobfuscation, babel, virtual-machine, security-research.
- Tagged v1.0, GitHub release created with paper.pdf attached.
- DoD: public repo live; make reproduce works from pinned samples; paper builds (8pp); replication table complete (12 claims); xhs vectors+pass-rate published (N/A, honest); no signer/creds/personal-data/full-bundles in repo or history. ALL PASS.

## 2026-11-13: Paper #2 (data-flow study) — M1 kickoff

- New companion study: what TikTok/XHS apps collect & transmit, own-device + static, evidence-graded (CAN-COLLECT / HAS-CODE / OBSERVED kept strictly separate). Cites paper #1.
- Decisions (owner): same repo under paper2/; account zkp6c4vr89-coder; STATIC-FIRST now, dynamic (emulator+mitmproxy+Frida) as phase 2; APKs from a mirror (pin SHA-256, note unofficial provenance).
- Tooling: adb/emulator/aapt2 present in ~/Library/Android/sdk; java/python3/node/docker/brew/pip present. Need install: jadx, apktool, exodus-standalone, MobSF(docker), mitmproxy, frida.
- Honest blockers flagged to owner: (1) I can't log in / drive apps — owner does interaction; (2) cert pinning likely blocks OBSERVED tier without Frida unpinning on the emulator; paper may lean CAN/HAS-CODE with OBSERVED where available.
- Scaffolded: paper2/, analysis/{tiktok,xhs}/dataflow.md, data/apps.csv, data/field_catalogue.csv (field|level|destination|1p-or-sdk|encrypted|evidence), data/permissions_*.csv, data/trackers.csv. gitignore: *.apk/*.flows/samples/apks|captures|decompiled, mobsf_reports/.
- NOT yet done: no APK downloaded, nothing installed, nothing captured.

## 2026-11-13: paper #2 M4 static surface (CAN-COLLECT + HAS-CODE)

- APKs supplied by owner (apkmirror .apkm bundles): TikTok com.zhiliaoapp.musically 47.7.3 (sha e9a63e6c), XHS com.xingin.xhs 9.53.0 (sha 26a5938b). Pinned data/apps.csv. .apkm/base.apk/dex all in samples/ (gitignored).
- CAN-COLLECT (aapt2 dump permissions): TikTok 64 perms (12 sensitive incl FINE_LOCATION, MEDIA_LOCATION, CONTACTS, RECORD_AUDIO, CAMERA, BLUETOOTH_SCAN/ADVERTISE proximity). XHS 70 perms (15 sensitive incl CALENDAR r/w, GET/MANAGE_ACCOUNTS, location, contacts, camera, mic). -> data/permissions_*.csv + _full.txt.
- HAS-CODE (DEX namespace scan, 15 TT / 21 XHS dex): Firebase, GMS Ads, AppsFlyer, Facebook SDK, Tencent in both; ByteDance (1p in TT, 3p in XHS); XHS also Alipay + AMap. 
- HONESTY: disambiguated com/facebook/* -> FacebookSdk+login present (real SDK) vs Fresco/React-Native (NOT trackers; most of XHS facebook namespaces are RN). Labeled all tracker rows "HAS-CODE: namespace present, not Exodus-classified, not runtime-confirmed". exodus-core failed to install on py3.14 (noted; namespace scan used instead).
- field_catalogue.csv: 20 rows (14 CAN-COLLECT, 6 HAS-CODE, 0 OBSERVED). Levels strictly separate columns.
- jadx still installing (brew) for M5 field-to-code; MobSF (docker) pending.

## 2026-11-13: paper #2 M5 (dex-level field-to-code, HAS-CODE)

- brew jadx install stuck ~1hr -> TaskStop'd. Downloading jadx 1.5.6 release zip directly (resumable, background) for Java-level traces.
- DEX collection-API scan (HAS-CODE): both apps reference AdvertisingIdClient(GAID), getInstalledPackages (app inventory), getLastKnownLocation, getMacAddress, ContactsContract, getPrimaryClip (clipboard), TelephonyManager/getSimOperator (carrier), SensorManager, getSerial, getRunningAppProcesses. XHS also Settings.Secure ANDROID_ID. 
- NOTABLE: getPrimaryClip (clipboard read) XHS 8 dex vs TikTok 2. Flagged, HAS-CODE only.
- field_catalogue.csv now 41 rows (14 CAN-COLLECT, 27 HAS-CODE, 0 OBSERVED). Every HAS-CODE row says "API referenced in N dex; not traced to a live call or network send."
- dataflow.md updated for both. Deeper jadx call-site trace for a couple of fields = pending jadx.

## 2026-11-13: paper #2 background citations verified (web search)
- Citizen Lab 2021 "TikTok vs Douyin: A Security and Privacy Analysis" (Pellaeon Lin, Mar 2021) — static Android source analysis. citizenlab.ca/2021/03/tiktok-vs-douyin-security-privacy-analysis/
- Citizen Lab 2025 "Network Security Issues in RedNote" (Wang, Knockel, Poetranto, Feb 12 2025) — NETWORK-security only; explicitly did NOT assess first-party collection or govt access (brief caveat confirmed). Flaw = MobTech SDK TLS-no-cert-validation + plain-HTTP media. Rule 4: do not exploit against others.
- EFF 2025 "Crimson Memo" (Feb 2025) — confirmed CL findings + privacy work. eff.org/deeplinks/2025/02/...
- Saved to paper2/refs.bib with framing notes. All real; none invented.
- jadx 1.5.6 still downloading (background) for deep M5 trace.
