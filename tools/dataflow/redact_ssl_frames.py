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
    method = path = host = None
    for ln in lines:
        m = re.match(r"(GET|POST|PUT|OPTIONS|HEAD|DELETE) (\S+)", ln)
        if m: method, path = m.group(1), m.group(2)
        if ln.lower().startswith("host:"): host = ln.split(":", 1)[1].strip()
    if not host:
        continue
    fp = classify_host(host, app)
    # query params in the path
    if path and "?" in path:
        for k, v in parse_qsl(path.split("?", 1)[1]):
            if k.lower() in SIG_HEADERS: continue
            seen.setdefault((host, "query:" + k), [k, host, fp, shape(v), looks_encrypted(v), "query(observed)"])
    # body fields (JSON or form) after the blank line
    if "\r\n\r\n" in head:
        body = head.split("\r\n\r\n", 1)[1]
        try:
            obj = json.loads(body)
            if isinstance(obj, dict):
                for k, v in obj.items():
                    seen.setdefault((host, "body:" + k), [k, host, fp, shape(v), looks_encrypted(v), "json-body(observed)"])
        except Exception:
            if "=" in body and "&" in body:
                for k, v in parse_qsl(body):
                    if k.lower() in SIG_HEADERS: continue
                    seen.setdefault((host, "form:" + k), [k, host, fp, shape(v), looks_encrypted(v), "form-body(observed)"])

with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["field", "destination_host", "first_party_or_sdk", "value_shape", "encrypted_heuristic", "location"])
    for row in sorted(seen.values(), key=lambda r: (r[1], r[0])):
        w.writerow(row)
print(f"wrote {len(seen)} OBSERVED field rows -> {out} (shapes only, no raw values)")
