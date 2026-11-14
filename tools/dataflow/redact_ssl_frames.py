#!/usr/bin/env python3
"""Redact Frida SSL-capture frames (own-device plaintext) into OBSERVED field metadata.

Input: samples/captures/ssl_frames.jsonl (gitignored raw plaintext from ssl_capture.js).
Output: redacted CSV -- field name, value SHAPE, destination host, first-party/SDK,
encrypted heuristic -- NEVER a raw value. Same rule-3 guarantee as extract_fields.py,
reusing its shape()/classify logic.

Usage: python3 tools/dataflow/redact_ssl_frames.py <app:tiktok|xhs> [out.csv]
"""
import sys, os, json, re, csv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_fields import shape, looks_encrypted, classify_host, SIG_HEADERS
from urllib.parse import parse_qsl

app = sys.argv[1] if len(sys.argv) > 1 else "xhs"
out = sys.argv[2] if len(sys.argv) > 2 else f"data/observed_fields_{app}.csv"
frames_path = "samples/captures/ssl_frames.jsonl"

seen = {}
cur_host = None
for line in open(frames_path, encoding="utf-8", errors="replace"):
    try: r = json.loads(line)
    except Exception: continue
    head = r.get("head", "")
    lines = head.split("\r\n")
    # Only treat a frame as an HTTP request if its FIRST line is a valid request line.
    # This excludes response/binary/media frames whose bytes could otherwise be
    # misread as header names (a redaction hazard).
    if not lines or not re.match(r"^(GET|POST|PUT|OPTIONS|HEAD|DELETE) \S+ HTTP/\d", lines[0]):
        continue
    method, path = lines[0].split(" ")[0], lines[0].split(" ")[1]
    host = None
    for ln in lines[1:]:
        if ln.lower().startswith("host:"): host = ln.split(":", 1)[1].strip(); break
    if not host or not re.match(r"^[A-Za-z0-9.:-]+$", host):
        continue
    fp = classify_host(host, app)
    # query params in the path
    if path and "?" in path:
        for k, v in parse_qsl(path.split("?", 1)[1]):
            if k.lower() in SIG_HEADERS: continue
            seen.setdefault((host, "query:" + k), [k, host, fp, shape(v), looks_encrypted(v), "query(observed)"])
    # data-bearing request headers (skip signature + generic transport headers)
    GENERIC = {"host", "user-agent", "accept", "accept-encoding", "accept-language",
               "content-type", "content-length", "connection", "cookie"}
    for ln in lines:
        if ":" not in ln or re.match(r"(GET|POST|PUT|OPTIONS|HEAD|DELETE) ", ln): continue
        name = ln.split(":", 1)[0].strip().lower()
        if not re.match(r"^[a-z0-9-]{2,40}$", name): continue  # valid header token only
        if name in SIG_HEADERS or name in GENERIC: continue
        if name.startswith("x-") or name in ("authorization", "device-id", "deviceid"):
            val = ln.split(":", 1)[1].strip()
            seen.setdefault((host, "hdr:" + name), [name, host, fp, shape(val), looks_encrypted(val), "header(observed)"])
    # body fields (JSON or form) after the blank line. Only parse PRINTABLE bodies, and
    # only accept valid token field names -- compressed/binary bodies (e.g. gzip) are
    # recorded as a single opaque field, never parsed byte-by-byte.
    TOKEN = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")
    if "\r\n\r\n" in head:
        body = head.split("\r\n\r\n", 1)[1]
        printable = body and all(32 <= ord(c) <= 126 or c in "\r\n\t" for c in body[:200])
        if not printable:
            seen.setdefault((host, "body:<binary/compressed>"),
                            ["<binary-or-compressed-body>", host, fp, shape(body), "likely", "opaque-body(observed)"])
        else:
            try:
                obj = json.loads(body)
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        if not TOKEN.match(str(k)): continue
                        seen.setdefault((host, "body:" + k), [k, host, fp, shape(v), looks_encrypted(v), "json-body(observed)"])
            except Exception:
                if "=" in body and "&" in body:
                    for k, v in parse_qsl(body):
                        if k.lower() in SIG_HEADERS or not TOKEN.match(k): continue
                        seen.setdefault((host, "form:" + k), [k, host, fp, shape(v), looks_encrypted(v), "form-body(observed)"])

with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["field", "destination_host", "first_party_or_sdk", "value_shape", "encrypted_heuristic", "location"])
    for row in sorted(seen.values(), key=lambda r: (r[1], r[0])):
        w.writerow(row)
print(f"wrote {len(seen)} OBSERVED field rows -> {out} (shapes only, no raw values)")
