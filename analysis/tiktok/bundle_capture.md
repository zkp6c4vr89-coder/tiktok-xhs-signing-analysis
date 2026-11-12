# A2: TikTok bundle capture and version pinning

## The bundle

TikTok's web anti-bot / request-signing code ships as a single script, **webmssdk**
(`bid: "webmssdk"`), loaded by the public web pages.

- **Discovery:** a logged-out GET of `https://www.tiktok.com/` (and `/explore`) on
  2026-11-12 referenced exactly one SDK URL:
  `https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/webmssdk/1.0.0.417/webmssdk.js`
- **Captured file:** `samples/webmssdk.1.0.0.417.js` (git-ignored, not redistributed).
- **SHA-256:** `6625c4fd90012eb2b6166002b278ac99ba2a2495325590f8eda9071544a814c8`
- **Size:** 243,702 bytes. **Date captured:** 2026-11-12.
- Pinned in [data/bundles.csv](../../data/bundles.csv); `make verify-samples` passes.
- Two public static GETs total (one page, one SDK file), logged out, generic
  user-agent, no cookies or personal data. No API calls.

## Version difference (a finding)

The reference repo never pinned a URL or hash; it pasted its *deobfuscated* source
into `deobf/output.js` and `debug.js`. Reading those, the reference analysed:

| Marker | Reference (pasted source) | Our capture (2026-11-12) |
|---|---|---|
| webmssdk **core** version (`dr = "…"`) | **1.12.2** | **1.16.6** |
| Asset-path version in URL | unknown (not recorded) | **1.0.0.417** |
| slardar sub-component `__version__` | 2.11.0 | (to confirm in A3) |

So the current bundle is **core 1.16.6**, four minor versions ahead of the reference's
**1.12.2**. The two version axes differ: the URL path version (`1.0.0.417`) is an asset
build number; the `dr` string (`1.16.6`) is the SDK's own semantic version. We cite the
file by its asset-path name but track findings against the internal `1.16.6`.

**Implication for Part A.** Replication targets our own pinned 1.16.6 capture. Where our
results differ from the reference's 1.12.2 numbers (opcode count, function count, which
`vm{n}` emits which token), the version gap is a candidate explanation and will be called
out rather than treated as an error in either analysis. The reference's exact 1.12.2 code
is still available to us as the pasted source in `samples/reference/`, so structural
comparison across versions is possible offline.

## Sanity checks on the capture

- `msToken` (1) and `mssdk` (41) occur as plaintext — consistent with the webmssdk SDK.
- `X-Bogus` / `X-Gnarly` do **not** occur as plaintext (0 each). Expected: the header
  names live in the VM's encoded string array, which is the whole point of the
  obfuscation. Recovering them is a goal of A3 (string deobfuscation) and A5 (tracing).
