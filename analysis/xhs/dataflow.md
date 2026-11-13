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

## OBSERVED (on the wire) — dynamic
None yet. Deferred to the dynamic phase. The `x-s` signing layer is characterised in
paper #1.

## Status
- [x] M4 static surface (permissions + tracker namespaces)
- [ ] M4 MobSF report (pending)
- [ ] M5 field-to-code traces (pending jadx)
- [ ] M2/M3 own-device capture + field extraction (deferred)
