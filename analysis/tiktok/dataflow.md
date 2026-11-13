# tiktok data-flow findings (paper #2)

Evidence is graded at three strictly separate levels. A field is only written at the
level its evidence supports; a lower level is **never** reported as a higher one.

| Level | Means | Evidence source |
|---|---|---|
| **CAN-COLLECT** | a permission is present | `AndroidManifest.xml` (static) |
| **HAS-CODE** | a collection code path exists | decompiled code location (static) |
| **OBSERVED** | the value was actually sent | own-device capture (dynamic) |

"Has permission" and "has code" are **not** "is sending." Findings are pinned to the
app build in [data/apps.csv](../../data/apps.csv); current builds may differ.

## Status
- [ ] M1 interception setup
- [ ] M2 own-device capture (deferred: static-first phase)
- [ ] M3 field extraction
- [ ] M4 static surface (MobSF + Exodus, permissions, trackers)
- [ ] M5 field-to-code traces

_Findings appear here with evidence paths as the analysis proceeds._
