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

## STORED-ON-DEVICE (local persistence) — static read of own-device app data
Pulled XHS's own app-data dir on the rooted emulator and read **schema/key names only**
(never row values; the pulled DBs stay git-ignored). Data XHS persists locally
([data/stored_on_device_xhs.csv](../../data/stored_on_device_xhs.csv)):
- **`NoteReadRecordDB.noteReadRecord`** — per-note reading history with **dwell time**
  (`stay_seconds`), note_id, note_title, timestamp.
- **`PlayHistoryRecordDB.historyRecord`** — full view history incl. `author_id`, `user_name`.
- **`analysisemitter.sqlite`** / **`json_tracker.apm`** — queued analytics events; `apm.zone`
  defaults to **`'CN'`**.
- **`google_app_measurement_local.db`** — Firebase Analytics local event queue.
- shared_prefs persistent identifiers: Facebook **`anonymousAppDeviceGUID`**, Firebase
  `app_instance_id`/`first_open_time`/`session_id`, AppsFlyer `AF_INSTALLATION`/`attributionId`.

This is evidence of **local retention** (behavioural history + tracking identifiers), a
distinct tier from network transmission. It does not by itself prove upload (that is the
OBSERVED tier); the analytics tables are explicitly upload *queues*, which implies intent.

## Anti-analysis hardening (why deeper OBSERVED is blocked) — a finding
XHS actively resists own-device dynamic analysis on multiple layers, established by
direct test on the rooted emulator:
1. **Native TLS via Cronet** (`libcronet.114.0.5735.38.so`): first-party feed/search/live
   API goes through Chromium Cronet, which ignores the HTTP proxy and pins at a
   statically-linked, **fully stripped** BoringSSL (0 `SSL_*` symbols) — not hookable by name.
2. **Frida Java bridge blocked**: `Java.available` never becomes true in the XHS process
   (`JAVA_NEVER after 61` polls) although **native `Interceptor` hooks work** (SSL_read/
   write on `libssl`/`libred*` succeed). So Java-layer hooks (cronet request builder,
   analytics event logger) cannot be installed — anti-tamper defeats ART instrumentation.
3. **Fast queue flush**: local analytics queues (`analysisemitter`, `json_tracker.apm`)
   empty quickly after upload, so at-rest mining catches few events.

Net effect: own-device OBSERVED is limited to non-Cronet TLS (SDK traffic, media CDN,
`/speedtest`) plus the STORED-ON-DEVICE tier. Reaching the Cronet feed API would require
defeating these anti-tamper layers, which this project does not do (reading own data is in
scope; disabling a hardened app's integrity/anti-tamper protections is out of scope and,
here, beyond what native-only instrumentation can reach). **Platform-side scraping is
explicitly excluded** by the project's own rules (no automated/bulk requests; not a scraper).

## Cronet crack — methods attempted and why each failed (native-capability exhausted)
To reach the first-party feed/search/lives plaintext, every own-device method available
was tried on the rooted emulator:
| Method | Result |
|---|---|
| HTTP proxy (mitmproxy) | Cronet ignores the system proxy; 0 first-party flows |
| Native `SSL_read`/`SSL_write` by symbol (`libssl`, `libred*`) | Works, but only catches non-Cronet TLS (SDK, media CDN, `/speedtest`) |
| Native symbol hook of `libcronet` BoringSSL | `libcronet.114.0.5735.38.so` fully stripped: 0 `SSL_*` symbols |
| Cronet **C-API** hook (`Cronet_UrlRequest_InitWithParams`, `OnReadCompleted`) | Installs, never fires — XHS uses Cronet's **Java/JNI** API, not the C API |
| Frida **Java** hooks (cronet request builder, analytics logger) | `Java.available` never true (`JAVA_NEVER`) — ART anti-tamper blocks the bridge while native hooks work |
| `getaddrinfo`/socket probe | Confirms network happens (e.g. `live-source-play.xhscdn.com` for a live stream) but yields no plaintext |

Remaining theoretical paths (BoringSSL byte-pattern scan of the stripped 6.4 MB lib;
`RegisterNatives` JNI-table hooking, which needs spawn-time instrumentation that
anti-tamper blocks) are deep, fragile, and cross into defeating the app's protections —
out of scope. **Conclusion: XHS's first-party payloads are, by deliberate multi-layer
hardening, not observable with own-device instrumentation.** This resistance is a
finding. Platform-side bulk collection remains excluded by the project rules.
