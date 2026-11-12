# B1: Xiaohongshu / RedNote `x-s` recon and input→output contract

## Capture (logged out)

`xiaohongshu.com` now 302-redirects to the **rednote.com** rebrand; the explore page
redirects to a login wall that still serves the full public PC-web bundle set from
`fe-platform-s10.rednotecdn.com/formula-static/xhs-pc-web/public/resource/js/`. Four
bundles were captured and pinned in [data/bundles.csv](../../data/bundles.csv):
`bundler-runtime`, `index`, `vendor`, and **`vendor-dynamic.bb0b0051.js`** (the signer).

Two further modules under `fe-s10.rednotecdn.com/as/v1/…` (an anti-spam SDK) return
**403** without a site referer/origin. We did **not** spoof headers to retrieve them
(that would be bot-check circumvention); it turned out to be unnecessary — the signer
is embedded in `vendor-dynamic`, which we fetched normally.

## Where `x-s` is set

In `vendor-dynamic.bb0b0051.js`, an axios request interceptor builds and attaches the
signature headers:

```js
var u = t.http.buildURL(i, d, s),           // u = full URL: path + serialized query
    l = window.sign(u, e.data) || {},        // sign(url, body) -> header object
    b = (window.f && typeof window.f === "function") ? window.f() : {};
e.headers = Object.assign({}, e.headers, l, b);
```

and a cost probe records whether the newer signer is present:

```js
type: (window && window._webmsxyw) ? "sign_new" : "sign_old"
```

So the older public write-ups pointing at **`window._webmsxyw`** are correct about the
*global*, but the **call site uses `window.sign(url, body)`**; `_webmsxyw` is the newer
implementation that `window.sign` delegates to when present. `window.f()` contributes
additional headers (device/trace). Verified, not assumed (brief B1).

### Input → output contract

| Direction | Item | Evidence |
|---|---|---|
| **in** | `url` — request URI + serialized query (`buildURL(i,d,s)`) | interceptor above |
| **in** | `data` — request body | `window.sign(u, e.data)` |
| **in** | `a1` cookie (+ `webId`, `gid`, `b1`, `p1`) | cookie-name table `…u="a1",l="webId",b="gid",_="b1",x="p1"…` |
| **in** | timestamp | `anti_spam_sign_cost` uses `Date.now()`; `x-t` is a ms timestamp (to confirm in B4) |
| **out** | header object `l` merged into the request: `x-s`, `x-t`, `x-s-common` (+ `x-b3`, `X-Sign` seen) | merged via `Object.assign` into `e.headers` |

The exact output keys are produced *inside* the signer payload (not plaintext in the
bundle); confirming the full set and the role of `x-s-common` / `x-t` is a B4 task.

## The signer is classic obfuscated JS, not a bytecode VM

`vendor-dynamic` embeds the signer as a **287,204-character string literal** that
begins:

```
var _0x5ae8=['doeZk','vSuEv','FSUSO','KJsij','VKZwl', … ]
```

This is the hallmark of **javascript-obfuscator** (hex-named `_0x…` string array with
index indirection), the exact pattern our Part A string-array pass
([tools/deobf/passes/string-array.js](../../tools/deobf/passes/string-array.js)) was
built for — and which was *absent* from TikTok 1.16.6. Primitive signals in the payload:
`MD5` (1), `charCodeAt`/`fromCharCode`, `atob` (base64), `unescape`. No bytecode-VM
markers.

**This is the headline contrast for Part C:** TikTok protects its signer with a
bespoke **bytecode VM**; Xiaohongshu uses **string-array + control-flow JavaScript
obfuscation** over ordinary (if mangled) source. Different defensive strategies for the
same goal.

## Pinned bundle

`xhs/vendor-dynamic.bb0b0051.js`, SHA-256
`25e31f6bac526ff888fe06fbc72b8e43e93b0bd43444e3858d2a7c055a286c37`, captured 2026-11-12.
(No internal semver string found yet; the asset hash `bb0b0051` is the version handle.)

## Next (B2–B4)

- B2: run the signer under the logging-Proxy harness; record the fingerprint surface.
- B3: extract the 287 K payload, run the string-array pass + add control-flow
  unflattening / proxy-inlining passes as needed.
- B4: trace `url + body + a1 + timestamp → x-s`, identifying MD5 and the base64/XOR or
  custom-alphabet steps.
