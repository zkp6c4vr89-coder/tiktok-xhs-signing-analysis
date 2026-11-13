#!/usr/bin/env python3
"""Regression test: the field extractor must emit shapes/names but NEVER raw values."""
import subprocess, sys, os, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
har = os.path.join(HERE, "fixture.har")
out = os.path.join(tempfile.gettempdir(), "redaction_test_out.csv")
subprocess.run([sys.executable, os.path.join(ROOT, "tools/dataflow/extract_fields.py"), har, "tiktok", out], check=True)
txt = open(out).read()
# 1. No raw values from the fixture may appear in the output.
RAW = ["SYNTH_device", "SYNTH-gaid-uuid-000011112222", "SYNTH_sig", "SYNTH0000token0000hex0000value00",
       "SYNTH_userid_777", "SYNTH_demo@example.com", "12.3456", "U1lOVEhfb3BhcXVl", "SYNTHid"]
leaked = [r for r in RAW if r in txt]
assert not leaked, f"RAW VALUE LEAK: {leaked}"
# 2. Expected field NAMES must be present (names are published, values are not).
for name in ["device_id", "gaid", "email", "lat", "user_id", "payload", "x-tt-token", "app_instance_id"]:
    assert name in txt, f"missing field name: {name}"
# 3. Signature header must be excluded as a data field.
assert "x-bogus" not in txt.lower(), "signature header leaked into data fields"
# 4. SDK host classified.
assert "SDK:Google Firebase" in txt, "SDK host not classified"
print("PASS: redaction holds, field names present, signature excluded, SDK classified")
