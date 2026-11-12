"use strict";
/**
 * End-to-end offline VM pipeline for a pinned webmssdk bundle (1.16.x):
 *   raw bundle -> beautify -> extract bytecode blob -> base64+inflate ->
 *   build opcode table -> recursive-descent disassembly -> coverage report.
 *
 * Reads only the pinned sample; writes derived artefacts under samples/ (bytecode,
 * beautified source; git-ignored) and the opcode table + entries under data/.
 *
 * Usage: node tools/vm/pipeline.js [samples/webmssdk.1.0.0.417.js]
 */
const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const { decodeBytecode, findBytecodeBlob } = require("./decode");
const { buildTable } = require("./build_opcode_table");
const { disassembleAll } = require("./disasm");

const ROOT = path.resolve(__dirname, "..", "..");
const input = process.argv[2] || path.join(ROOT, "samples", "webmssdk.1.0.0.417.js");

const src = fs.readFileSync(input, "utf8");
const ast = parser.parse(src, { sourceType: "script", errorRecovery: true });

// 1. beautified source (derived, git-ignored) — needed by the opcode-table builder
const beautified = path.join(ROOT, "samples", "webmssdk.1.16.6.beautified.js");
fs.writeFileSync(beautified, generate(ast, { compact: false, comments: true }).code);

// 2. bytecode
const blob = findBytecodeBlob(ast, traverse);
const bytecode = decodeBytecode(blob);
fs.writeFileSync(path.join(ROOT, "samples", "tiktok_bytecode_1.16.6.bin"), bytecode);

// 3. opcode table
const table = buildTable(beautified);
fs.writeFileSync(path.join(ROOT, "data", "tiktok_opcodes_1.16.6.json"), JSON.stringify(table, null, 0) + "\n");

// 4. constant function entry offsets (seeds) — every numeric 1st-arg to S(...)
let dArr = null, best = 0;
traverse(ast, { ArrayExpression(p) { const f = p.node.elements.filter((e) => e && /Function/.test(e.type)).length; if (f > best) { best = f; dArr = p.node; } } });
const seeds = new Set([0]);
dArr.elements.forEach((h) => traverse(h, { noScope: true, CallExpression(p) {
  if (p.node.callee && p.node.callee.name === "S" && p.node.arguments[0] && p.node.arguments[0].type === "NumericLiteral") seeds.add(p.node.arguments[0].value);
} }));
const seedArr = [...seeds].sort((a, b) => a - b);
fs.writeFileSync(path.join(ROOT, "data", "tiktok_function_entries_1.16.6.json"), JSON.stringify(seedArr));

// 5. recursive-descent disassembly + coverage
const r = disassembleAll(bytecode, table, seedArr);
const pct = ((r.coveredBytes / r.total) * 100).toFixed(1);
console.log(`bytecode: ${bytecode.length} bytes | opcodes: ${table.length} | seed entries: ${seedArr.length}`);
console.log(`functions discovered: ${r.functions.length} | returned cleanly: ${r.ended} | desynced: ${r.desynced} | coverage: ${r.coveredBytes}/${r.total} (${pct}%)`);
