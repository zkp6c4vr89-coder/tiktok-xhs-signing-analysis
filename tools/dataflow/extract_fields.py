#!/usr/bin/env python3
"""Field extractor + redactor for own-device captures (paper #2, M3).

Input: a HAR file exported from mitmproxy (own-device capture, gitignored under
samples/captures/). Output: redacted field metadata ONLY -- field name, value SHAPE
(type + length bucket + charset class), destination host, first-party-or-SDK guess, and
a plaintext/encrypted heuristic. It NEVER emits a raw value, so its output is safe to
commit. This is the redaction guarantee required by the project's rule 3.

Usage:
  python3 tools/dataflow/extract_fields.py <capture.har> <app:tiktok|xhs> [out.csv]

The output rows are OBSERVED-tier evidence: a field here was actually seen on the wire.
Keep that level separate from CAN-COLLECT (permissions) and HAS-CODE (static).
"""
import sys, json, re, base64, csv
from urllib.parse import urlparse, parse_qsl

# Known signature headers from paper #1 -- separated out, not treated as data fields.
SIG_HEADERS = {"x-bogus", "x-gnarly", "x-argus", "x-gorgon", "x-ladon", "x-khronos",
               "x-s", "x-t", "x-s-common", "x-mns", "x-sign", "x-b3"}

# First-party host hints vs third-party SDK endpoints.
FIRST_PARTY = {"tiktok": re.compile(r"(tiktok|byteoversea|tiktokv|ttwstatic|musical)", re.I),
               "xhs": re.compile(r"(xiaohongshu|xhscdn|rednote|xhs)", re.I)}
SDK_HOSTS = {
    "app-measurement.com": "Google Firebase", "google-analytics.com": "Google Analytics",
    "appsflyer.com": "AppsFlyer", "graph.facebook.com": "Facebook", "crashlytics": "Firebase Crashlytics",
    "amap.com": "AMap", "umeng": "Umeng", "sensorsdata": "SensorsData", "adjust.com": "Adjust",
}

def shape(v):
    """Describe a value's SHAPE without revealing it."""
    if v is None: return "null"
    s = str(v)
    n = len(s)
    bucket = "0" if n == 0 else "1-8" if n <= 8 else "9-32" if n <= 32 else "33-128" if n <= 128 else ">128"
    if re.fullmatch(r"-?\d+", s): cls = "int"
    elif re.fullmatch(r"-?\d+\.\d+", s): cls = "float"
    elif re.fullmatch(r"[0-9a-fA-F]{8,}", s): cls = "hex"
    elif re.fullmatch(r"[A-Za-z0-9_\-]{16,}={0,2}", s): cls = "base64/token"
    elif re.fullmatch(r"[0-9a-fA-F-]{32,36}", s): cls = "uuid-like"
    elif re.fullmatch(r"[\x20-\x7e]+", s): cls = "ascii"
    else: cls = "bytes/other"
    return f"{cls}:{bucket}"

def looks_encrypted(v):
    """Heuristic: high-entropy base64/hex blob => likely encrypted/opaque."""
    s = str(v)
    if len(s) < 24: return "no"
    if re.fullmatch(r"[A-Za-z0-9+/_\-]{24,}={0,2}", s) or re.fullmatch(r"[0-9a-fA-F]{32,}", s):
        return "likely"
    return "no"

def classify_host(host, app):
    for frag, name in SDK_HOSTS.items():
        if frag in host: return f"SDK:{name}"
    if FIRST_PARTY[app].search(host): return "first-party"
    return "third-party/unknown"

def walk(obj, prefix=""):
    """Yield (field_path, value) for leaves of a nested JSON structure."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk(v, f"{prefix}.{k}" if prefix else str(k))
    elif isinstance(obj, list):
        if obj: yield from walk(obj[0], f"{prefix}[]")
    else:
        yield prefix, obj

def main():
    if len(sys.argv) < 3:
        print("usage: extract_fields.py <capture.har> <tiktok|xhs> [out.csv]"); sys.exit(2)
    har_path, app = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else f"data/observed_fields_{app}.csv"
    har = json.load(open(har_path))
    seen = {}  # (host, field) -> row, deduped (first shape kept)
    for entry in har.get("log", {}).get("entries", []):
        req = entry["request"]
        host = urlparse(req["url"]).netloc
        fp = classify_host(host, app)
        # query params
        for k, v in parse_qsl(urlparse(req["url"]).query):
            if k.lower() in SIG_HEADERS: continue
            seen.setdefault((host, "query:" + k), [k, host, fp, shape(v), looks_encrypted(v), "query"])
        # data-bearing headers (skip signature + generic)
        for h in req.get("headers", []):
            name = h["name"].lower()
            if name in SIG_HEADERS or name in ("host","user-agent","accept","content-type","content-length","connection","accept-encoding","cookie"):
                continue
            if name.startswith("x-") or name in ("authorization",):
                seen.setdefault((host, "hdr:" + name), [name, host, fp, shape(h.get("value","")), looks_encrypted(h.get("value","")), "header"])
        # body
        pd = req.get("postData", {})
        text = pd.get("text", "")
        if text:
            try:
                body = json.loads(text)
                for path, val in walk(body):
                    seen.setdefault((host, "body:" + path), [path, host, fp, shape(val), looks_encrypted(val), "json-body"])
            except Exception:
                # form-encoded or opaque
                if "=" in text and "&" in text:
                    for k, v in parse_qsl(text):
                        if k.lower() in SIG_HEADERS: continue
                        seen.setdefault((host, "form:" + k), [k, host, fp, shape(v), looks_encrypted(v), "form-body"])
                else:
                    seen.setdefault((host, "body:<opaque>"), ["<opaque-body>", host, fp, shape(text), looks_encrypted(text), "opaque-body"])
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["field", "destination_host", "first_party_or_sdk", "value_shape", "encrypted_heuristic", "location"])
        for row in sorted(seen.values(), key=lambda r: (r[1], r[0])):
            w.writerow(row)
    print(f"wrote {len(seen)} OBSERVED field rows -> {out} (no raw values; shapes only)")

if __name__ == "__main__":
    main()
