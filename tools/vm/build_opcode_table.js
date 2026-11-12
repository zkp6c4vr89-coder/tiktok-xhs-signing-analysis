"use strict";
/**
 * Build the VM opcode table for webmssdk 1.16.x.
 *
 * The 1.16.x VM dispatches via a handler array `d`: the interpreter loop reads a
 * 16-bit opcode `f = (g[I++]<<8)|g[I++]` and calls `d[f](u)`. Each handler reads
 * its own operands from the bytecode with three readers:
 *     O(n) -> 1 byte      p(n) -> 2 bytes (uint16)     m(n) -> 3 bytes (uint24)
 * and accesses the register file `u.o` via C/L (get), Q/I (set), U (post-inc).
 *
 * We extract every handler, record its operand-read sequence (hence its encoded
 * length), flag variadic handlers (a reader inside a loop), and assign a coarse,
 * explicitly-heuristic category from the operators in its body. Output is written
 * as data/tiktok_opcodes_1.16.6.json — our authoritative, regenerable opcode table.
 *
 * Usage: node build_opcode_table.js <beautified-bundle.js> <out.json>
 */
const fs = require("node:fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;

const OPSIZE = { O: 1, p: 2, m: 3 };

const LOOP_TYPES = new Set(["ForStatement", "WhileStatement", "DoWhileStatement", "ForInStatement", "ForOfStatement"]);

// True iff a bytecode reader (O/p/m) call sits in a loop *body* (so it runs a
// runtime-dependent number of times). Readers in a for-initializer run once and
// are NOT variadic. Manual AST walk tracking whether we are inside a loop body.
function hasReaderInLoopBody(node, inLoopBody = false) {
  if (!node || typeof node.type !== "string") return false;
  if (node.type === "CallExpression" && node.callee && (node.callee.name === "O" || node.callee.name === "p" || node.callee.name === "m")) {
    if (inLoopBody) return true;
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments") continue;
    const child = node[key];
    const childInLoopBody = LOOP_TYPES.has(node.type) && key === "body" ? true : inLoopBody;
    const kids = Array.isArray(child) ? child : [child];
    for (const k of kids) {
      if (k && typeof k.type === "string" && hasReaderInLoopBody(k, childInLoopBody)) return true;
    }
  }
  return false;
}

function categorize(code) {
  const has = (s) => code.includes(s);
  if (/\.call\(|\.apply\(/.test(code)) return "call";
  if (has("new ")) return "construct";
  if (/\bS\(/.test(code)) return "make-function";
  if (/push\(|\[\]/.test(code)) return "array";
  if (/\^|<<|>>>|>>|[^&]&[^&]|[^|]\|[^|]/.test(code)) return "bitwise";
  if (/[^+]\+[^+]|[^-]-[^-]|\*|\/|%/.test(code)) return "arith";
  if (/===|!==|==|!=|<=|>=|<|>/.test(code)) return "compare";
  if (/Q\(|I\(n,/.test(code)) return "store";
  if (/C\(|L\(n,/.test(code)) return "load";
  if (/\.A\b|\.h\b|throw|E\(n\)/.test(code)) return "control/exception";
  return "other";
}

function buildTable(bundlePath) {
  const src = fs.readFileSync(bundlePath, "utf8");
  const ast = parser.parse(src, { sourceType: "script", errorRecovery: true });

  // handler table = the array literal with the most function elements
  let dArr = null, best = 0;
  traverse(ast, {
    ArrayExpression(p) {
      const fns = p.node.elements.filter((e) => e && (e.type === "FunctionExpression" || e.type === "ArrowFunctionExpression")).length;
      if (fns > best) { best = fns; dArr = p.node; }
    },
  });
  if (!dArr) throw new Error("handler table not found");

  return dArr.elements.map((h, op) => {
    const code = generate(h, { compact: true }).code;
    const reads = (code.match(/\b([pOm])\(n\)/g) || []).map((x) => x[0]);
    const operandBytes = reads.reduce((s, r) => s + OPSIZE[r], 0);
    const variadic = hasReaderInLoopBody(h);
    // terminal = writes the return register o[4] (ends the interpreter loop);
    // setsPC = assigns n.I (an in-function jump).
    const terminal = /o\[4\]=|[QI]\(n,4,/.test(code);
    const setsPC = /n\.I=/.test(code);
    return { op, reads: reads.join(""), operandBytes, variadic, terminal, setsPC, category: categorize(code), bodyLen: code.length };
  });
}

if (require.main === module) {
  const [bundle, out] = process.argv.slice(2);
  if (!bundle || !out) { console.error("usage: node build_opcode_table.js <bundle.js> <out.json>"); process.exit(2); }
  const table = buildTable(bundle);
  fs.writeFileSync(out, JSON.stringify(table, null, 0) + "\n");
  const byCat = {};
  table.forEach((r) => (byCat[r.category] = (byCat[r.category] || 0) + 1));
  console.error(`opcodes: ${table.length}`);
  console.error(`variadic: ${table.filter((r) => r.variadic).length}`);
  console.error("by category: " + JSON.stringify(byCat));
}

module.exports = { buildTable };
