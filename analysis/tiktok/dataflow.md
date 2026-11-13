# TikTok data-flow findings (paper #2)

Evidence graded at three strictly separate levels; a lower level is never written as a
higher one. **CAN-COLLECT** = permission present (manifest). **HAS-CODE** = collection/
SDK code path present (static). **OBSERVED** = seen on the wire (dynamic). "Has
permission" and "has code" are **not** "is sending."

Pinned build: `com.zhiliaoapp.musically` **47.7.3** (2024707030), apkmirror .apkm,
SHA-256 `e9a63e6c...` ([data/apps.csv](../../data/apps.csv)). Findings are version-pinned;
current builds may differ.

## CAN-COLLECT (permissions) — static
64 declared permissions; 12 sensitive ([data/permissions_tiktok.csv](../../data/permissions_tiktok.csv),
full list `data/permissions_tiktok_full.txt`). Notable: `ACCESS_FINE_LOCATION`,
`ACCESS_MEDIA_LOCATION` (photo geotags), `READ_CONTACTS`, `RECORD_AUDIO`, `CAMERA`,
and `BLUETOOTH_SCAN`/`BLUETOOTH_ADVERTISE` (nearby-device proximity). Evidence:
`aapt2 dump permissions` on the pinned base.apk.

## HAS-CODE (SDKs present in DEX) — static
15 DEX files scanned for SDK namespaces ([data/trackers.csv](../../data/trackers.csv)).
Present: Google Firebase, Google Mobile Ads, AppsFlyer (attribution), the Facebook SDK
(`com/facebook/FacebookSdk` + `com/facebook/login`, distinct from the Fresco image lib
also present), ByteDance first-party SDKs, and Tencent SDK. **Namespace presence is a
static HAS-CODE signal, not Exodus classification and not runtime confirmation.**

## OBSERVED (on the wire) — dynamic
None yet. The dynamic capture phase (emulator + mitmproxy + Frida unpinning on own
device) is deferred; see paper-#1 signing headers (`X-Bogus`, `X-Gnarly`) for the
request-signing layer that wraps these payloads.

## Status
- [x] M4 static surface (permissions + tracker namespaces)
- [ ] M4 MobSF report (pending)
- [ ] M5 field-to-code traces (pending jadx)
- [ ] M2/M3 own-device capture + field extraction (deferred)
