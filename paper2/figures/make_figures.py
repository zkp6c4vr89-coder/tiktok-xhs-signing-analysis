#!/usr/bin/env python3
"""Figures for paper #2, generated from the committed data (data/*.csv).

  - fig_tiers.pdf : evidence-graded field counts by level (+ stored-on-device)
  - fig_perms.pdf : permissions declared vs sensitive, TikTok vs Xiaohongshu

Numbers are read from the CSVs, not hard-coded, so the figures trace to the repo.
Run: python3 paper2/figures/make_figures.py
"""
import csv, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIG = os.path.join(ROOT, "paper2", "figures")
D = os.path.join(ROOT, "data")

def rows(p):
    with open(os.path.join(D, p)) as f:
        return list(csv.reader(f))

# ---- Figure 1: evidence tiers ----
cat = rows("field_catalogue.csv")[1:]
levels = {}
for r in cat:
    levels[r[1]] = levels.get(r[1], 0) + 1
stored = len(rows("stored_on_device_xhs.csv")) - 1
order = ["CAN-COLLECT", "HAS-CODE", "OBSERVED"]
vals = [levels.get(k, 0) for k in order] + [stored]
labels = order + ["STORED-\nON-DEVICE"]
colors = ["#b0b0b0", "#6f9fd8", "#3b6ea5", "#3b8a5a"]

fig, ax = plt.subplots(figsize=(6.4, 2.8))
ax.bar(range(len(vals)), vals, color=colors)
ax.set_xticks(range(len(labels)))
ax.set_xticklabels(labels, fontsize=8)
ax.set_ylabel("field / artifact count")
ax.set_title("Evidence-graded data-flow catalogue (strict tiers)", fontsize=10)
for i, v in enumerate(vals):
    ax.text(i, v + 0.3, str(v), ha="center", fontsize=9)
fig.tight_layout()
fig.savefig(os.path.join(FIG, "fig_tiers.pdf"))
plt.close(fig)

# ---- Figure 2: permissions ----
def count_lines(p):
    with open(os.path.join(D, p)) as f:
        return sum(1 for ln in f if ln.strip())
tk_total, tk_sens = count_lines("permissions_tiktok_full.txt"), len(rows("permissions_tiktok.csv")) - 1
xhs_total, xhs_sens = count_lines("permissions_xhs_full.txt"), len(rows("permissions_xhs.csv")) - 1

fig, ax = plt.subplots(figsize=(6.4, 2.8))
x = [0, 1]
w = 0.38
ax.bar([i - w / 2 for i in x], [tk_total, xhs_total], w, label="declared", color="#6f9fd8")
ax.bar([i + w / 2 for i in x], [tk_sens, xhs_sens], w, label="dangerous/sensitive", color="#b55353")
ax.set_xticks(x)
ax.set_xticklabels(["TikTok 47.7.3", "Xiaohongshu 9.53.0"])
ax.set_ylabel("permissions")
ax.set_title("Declared vs sensitive permissions (CAN-COLLECT)", fontsize=10)
for i, (a, b) in enumerate(zip([tk_total, xhs_total], [tk_sens, xhs_sens])):
    ax.text(i - w / 2, a + 0.5, str(a), ha="center", fontsize=8)
    ax.text(i + w / 2, b + 0.5, str(b), ha="center", fontsize=8)
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(FIG, "fig_perms.pdf"))
plt.close(fig)
print("wrote fig_tiers.pdf, fig_perms.pdf")
