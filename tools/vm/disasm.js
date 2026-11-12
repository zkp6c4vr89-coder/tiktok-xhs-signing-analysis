"use strict";
/**
 * Linear-sweep disassembler for the webmssdk 1.16.x VM.
 *
 * The interpreter reads a 16-bit opcode and calls d[opcode], which then consumes
 * a fixed number of operand bytes (from the opcode table) via O/p/m readers.
 * Operands are register indices into u.o. We sweep the whole bytecode, decode
 * each instruction using the table's operand widths, and emit one annotated line
 * per instruction. Variadic opcodes (a reader inside a loop) have no static
 * length, so the sweep records a desync point there and reports coverage honestly
 * rather than pretending to a full linear decode.
 *
 * Usage: node disasm.js <bytecode.bin> <opcodes.json> [out.txt]
 */
const fs = require("node:fs");

function disassemble(bytecode, table, opts = {}) {
  const maxOp = table.length;
  const lines = [];
  let I = opts.start || 0;
  let decoded = 0, desync = null;
  const catCount = {};

  while (I + 2 <= bytecode.length) {
    const at = I;
    const op = (bytecode[I] << 8) | bytecode[I + 1];
    I += 2;
    if (op >= maxOp) { desync = { at, reason: `opcode ${op} >= ${maxOp}` }; break; }
    const t = table[op];
    catCount[t.category] = (catCount[t.category] || 0) + 1;

    // read operands by declared widths
    const ops = [];
    for (const r of t.reads) {
      if (r === "O") { ops.push(bytecode[I]); I += 1; }
      else if (r === "p") { ops.push((bytecode[I] << 8) | bytecode[I + 1]); I += 2; }
      else if (r === "m") { ops.push((bytecode[I] << 16) | (bytecode[I + 1] << 8) | bytecode[I + 2]); I += 3; }
    }
    lines.push(`${String(at).padStart(6)}  op${op} ${t.category}${ops.length ? " [" + ops.join(", ") + "]" : ""}${t.variadic ? "  ; VARIADIC (length is runtime-dependent)" : ""}`);
    decoded++;
    if (t.variadic) { desync = { at, reason: `variadic op ${op}` }; break; }
  }

  return {
    lines,
    decoded,
    bytesCovered: (desync ? desync.at : I),
    total: bytecode.length,
    desync,
    categoryHistogram: catCount,
  };
}

/**
 * Decode one VM function: linear from `entry` until a terminal opcode (writes the
 * return register o[4]) or a desync. Returns the instructions and the byte range
 * covered. Operand-driven make-function opcodes expose a child entry offset, which
 * we return so the caller can enqueue it (recursive descent over the flat image).
 */
function disassembleFunction(bytecode, table, entry) {
  const maxOp = table.length;
  const lines = [];
  const childEntries = [];
  let I = entry, desync = null, ended = false;
  while (I + 2 <= bytecode.length) {
    const at = I;
    const op = (bytecode[I] << 8) | bytecode[I + 1];
    I += 2;
    if (op >= maxOp) { desync = { at, reason: `opcode ${op} >= ${maxOp}` }; break; }
    const t = table[op];
    const ops = [];
    for (const r of t.reads) {
      if (r === "O") { ops.push(bytecode[I]); I += 1; }
      else if (r === "p") { ops.push((bytecode[I] << 8) | bytecode[I + 1]); I += 2; }
      else if (r === "m") { ops.push((bytecode[I] << 16) | (bytecode[I + 1] << 8) | bytecode[I + 2]); I += 3; }
    }
    // a 3-byte (m) operand on a make-function op is a child function entry offset
    if (t.category === "make-function") for (let k = 0; k < t.reads.length; k++) if (t.reads[k] === "m") childEntries.push(ops[k]);
    lines.push(`${String(at).padStart(6)}  op${op} ${t.category}${ops.length ? " [" + ops.join(", ") + "]" : ""}`);
    if (t.variadic) { desync = { at, reason: `variadic op ${op}` }; break; }
    if (t.terminal) { ended = true; break; }
  }
  return { entry, lines, childEntries, end: I, ended, desync };
}

/** Recursive-descent over a set of seed entries, following discovered child entries. */
function disassembleAll(bytecode, table, seeds) {
  const seen = new Set();
  const queue = [...seeds];
  const fns = [];
  const covered = new Uint8Array(bytecode.length);
  while (queue.length) {
    const e = queue.shift();
    if (seen.has(e) || e < 0 || e >= bytecode.length) continue;
    seen.add(e);
    const f = disassembleFunction(bytecode, table, e);
    fns.push(f);
    for (let b = e; b < f.end && b < bytecode.length; b++) covered[b] = 1;
    for (const c of f.childEntries) if (!seen.has(c)) queue.push(c);
  }
  let cov = 0; for (let i = 0; i < covered.length; i++) cov += covered[i];
  return { functions: fns, coveredBytes: cov, total: bytecode.length,
    ended: fns.filter((f) => f.ended).length, desynced: fns.filter((f) => f.desync).length };
}

if (require.main === module) {
  const [binPath, tablePath, mode, outDir] = process.argv.slice(2);
  if (!binPath || !tablePath) { console.error("usage: node disasm.js <bytecode.bin> <opcodes.json> [linear|recursive <entries.json>] [outDir]"); process.exit(2); }
  const bytecode = fs.readFileSync(binPath);
  const table = JSON.parse(fs.readFileSync(tablePath, "utf8"));
  if (mode && mode.startsWith("[")) {
    // recursive mode: `mode` is a JSON array of seed entries
    const seeds = JSON.parse(mode);
    const r = disassembleAll(bytecode, table, seeds);
    const pct = ((r.coveredBytes / r.total) * 100).toFixed(1);
    console.error(`functions: ${r.functions.length} | returned cleanly: ${r.ended} | desynced: ${r.desynced} | bytes covered: ${r.coveredBytes}/${r.total} (${pct}%)`);
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      const idx = r.functions.sort((a, b) => a.entry - b.entry);
      for (let i = 0; i < idx.length; i++) fs.writeFileSync(`${outDir}/fn_${idx[i].entry}.txt`, idx[i].lines.join("\n") + "\n");
      console.error(`wrote ${idx.length} function disassemblies to ${outDir}/`);
    }
  } else {
    const r = disassemble(bytecode, table);
    if (outDir) fs.writeFileSync(outDir, r.lines.join("\n") + "\n");
    const pct = ((r.bytesCovered / r.total) * 100).toFixed(1);
    console.error(`instructions: ${r.decoded} | bytes covered: ${r.bytesCovered}/${r.total} (${pct}%) before ${r.desync ? r.desync.reason : "end"}`);
  }
}

module.exports = { disassemble, disassembleFunction, disassembleAll };
