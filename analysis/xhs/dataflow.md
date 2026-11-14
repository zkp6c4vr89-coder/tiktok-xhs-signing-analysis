# XHS (Xiaohongshu / RedNote) data-flow findings (paper #2)

Evidence graded at three strictly separate levels; a lower level is never written as a
higher one. **CAN-COLLECT** = permission present (manifest). **HAS-CODE** = collection/
SDK code path present (static). **OBSERVED** = seen on the wire (dynamic). "Has
permission" and "has code" are **not** "is sending."

Pinned build: `com.xingin.xhs` **9.53.0** (9530803), apkmirror .apkm, SHA-256
`26a5938b...` ([data/apps.csv](../../data/apps.csv)). Version-pinned; current builds may differ.

## CAN-COLLECT (permissions) — static
70 declared permissions; 15 sensitive ([data/permissions_xhs.csv](../../data/permissions_xhs.csv),
full list `data/permissions_xhs_full.txt`). Notable beyond the usual location/contacts/
camera/mic: `READ_CALENDAR`/`WRITE_CALENDAR` (calendar access) and
`GET_ACCOUNTS`/`MANAGE_ACCOUNTS`/`AUTHENTICATE_ACCOUNTS` (device account access) —
both less common and worth highlighting. Evidence: `aapt2 dump permissions` on base.apk.

## HAS-CODE (SDKs present in DEX) — static
21 DEX files scanned ([data/trackers.csv](../../data/trackers.csv)). Present: Google
Firebase, Google Mobile Ads, AppsFlyer, the Facebook SDK (`FacebookSdk`+`login`; note
**most** `com/facebook/*` here is React Native, which is **not** a tracker), a ByteDance
SDK (third-party in this non-ByteDance app), Tencent SDK (likely WeChat share/login),
Alipay (payment), and AMap/AutoNavi (maps/location). Static presence only, not runtime.

## HAS-CODE (collection-API references in DEX) — static
The DEX references device/identifier collection APIs (counts = DEX files mentioning the
symbol; rows in [data/field_catalogue.csv](../../data/field_catalogue.csv)): advertising
ID / GAID, **Android ID** (`Settings.Secure ANDROID_ID`, 3 dex), installed-app inventory,
location (`getLastKnownLocation`/`FusedLocationProvider`), Wi-Fi MAC, contacts,
**clipboard** (`getPrimaryClip`, **8 dex** — markedly more than TikTok's 2), carrier/SIM
(`getSimOperator`, 6 dex), device sensors (18 dex), and device serial. **A symbol
reference is HAS-CODE only: the API appears in code, which is not proof it runs or that
any value is sent (the OBSERVED tier).** jadx call-site traces are the M5 deliverable.

## OBSERVED (on the wire) — dynamic
Captured on an own-device rooted emulator (android-34) by Frida-hooking BoringSSL
`SSL_read`/`SSL_write` in the app process (reading our own plaintext at the TLS boundary;
brief M6 — not a MITM, no forging). Raw frames stay git-ignored
(`samples/captures/ssl_frames.jsonl`); only redacted field metadata is published
([data/observed_fields_xhs.csv](../../data/observed_fields_xhs.csv), folded into the
master catalogue as OBSERVED rows).

**First-launch, no login** already sends to third-party SDKs over TLS:
- **graph.facebook.com** (Facebook SDK): `access_token`, `fields`, `format`, `platform`,
  `sdk`, `sdk_version` — shapes only, values redacted.
- **appsflyersdk.com** (AppsFlyer): `app_id`, `buildnumber`, plus an event POST
  (`/api/v6.18/androidevent`).

This upgrades the Facebook/AppsFlyer rows from HAS-CODE to **OBSERVED** for XHS.

**Method notes / limits (honest):**
- Capture uses the system `libssl.so`. XHS's **first-party API uses Cronet/ttnet with its
  own bundled BoringSSL** and **ignores the HTTP proxy**; those `SSL_*` symbols were not
  hooked by name, so first-party `edith.xiaohongshu.com` traffic is **not yet OBSERVED**
  here. Hooking cronet's BoringSSL and driving a logged-in session (scroll/search/post)
  is the remaining step; the app also shows anti-tamper behaviour under Frida.
- The `x-s` signing layer itself is characterised in paper #1.

## Status
- [x] M4 static surface (permissions + tracker namespaces)
- [ ] M4 MobSF report (pending)
- [ ] M5 field-to-code traces (pending jadx)
- [ ] M2/M3 own-device capture + field extraction (deferred)
