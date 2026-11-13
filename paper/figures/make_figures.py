#!/usr/bin/env python3
"""Generate the data-driven figures for the paper from committed repo data.

Reads data/tiktok_opcodes_1.16.6.json and emits:
  - fig_opcode_categories.pdf : opcode count by category (TikTok 1.16.6 VM)
  - fig_coverage.pdf          : disassembly outcome (functions returned vs desynced)

Numbers are taken from the data files / recorded analysis, not hard-coded guesses.
Run: python3 paper/figures/make_figures.py
"""
import json
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIGDIR = os.path.join(ROOT, "paper", "figures")

# ---- Figure 1: opcode categories ----
with open(os.path.join(ROOT, "data", "tiktok_opcodes_1.16.6.json")) as f:
    table = json.load(f)
cats = {}
for row in table:
    cats[row["category"]] = cats.get(row["category"], 0) + 1
items = sorted(cats.items(), key=lambda kv: kv[1], reverse=True)
labels = [k for k, _ in items]
values = [v for _, v in items]

fig, ax = plt.subplots(figsize=(6.6, 3.0))
ax.bar(range(len(values)), values, color="#3b6ea5")
ax.set_xticks(range(len(labels)))
ax.set_xticklabels(labels, rotation=40, ha="right", fontsize=8)
ax.set_ylabel("opcodes")
ax.set_title("TikTok webmssdk 1.16.6 VM: %d opcodes by category" % len(table), fontsize=10)
for i, v in enumerate(values):
    ax.text(i, v + 1, str(v), ha="center", va="bottom", fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(FIGDIR, "fig_opcode_categories.pdf"))
plt.close(fig)

# ---- Figure 2: disassembly coverage / outcomes ----
# From analysis/tiktok/A4_vm.md and make disasm: 351 functions, 245 returned cleanly,
# 106 desynced; byte coverage 88772 / 98961.
functions_total, returned_clean, desynced = 351, 245, 106
covered, total_bytes = 88772, 98961

fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.6, 2.7))
a1.bar(["returned\ncleanly", "desynced"], [returned_clean, desynced], color=["#3b8a5a", "#b55353"])
a1.set_ylabel("functions")
a1.set_title("Recursive-descent outcome\n(%d functions)" % functions_total, fontsize=9)
for i, v in enumerate([returned_clean, desynced]):
    a1.text(i, v + 3, str(v), ha="center", fontsize=8)

pct = covered / total_bytes * 100
a2.barh(["bytecode"], [pct], color="#3b6ea5")
a2.barh(["bytecode"], [100 - pct], left=[pct], color="#d9d9d9")
a2.set_xlim(0, 100)
a2.set_xlabel("% of 98,961 bytes")
a2.set_title("Linear coverage: %.1f%%" % pct, fontsize=9)
a2.text(pct / 2, 0, "%.1f%%" % pct, ha="center", va="center", color="white", fontsize=9)
fig.tight_layout()
fig.savefig(os.path.join(FIGDIR, "fig_coverage.pdf"))
plt.close(fig)

print("wrote fig_opcode_categories.pdf, fig_coverage.pdf to", FIGDIR)
