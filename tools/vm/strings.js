"use strict";
/**
 * String-pool recovery and token->function mapping for webmssdk 1.16.x.
 *
 * Strings live in a base64 pool `A`; each is decoded by l(value, key) = utf8(base64
 * decode(value)) XOR key, where the key is another pool entry. We do not know the
 * (value,key) pairing statically, so to locate specific known tokens we brute-force
 * all key candidates and keep only *exact* matches to a target list (an exact match
 * to "X-Bogus" cannot be coincidental). That yields the pool index of each token.
 *
 * Header names are loaded by bytecode operands (a string-load opcode takes the pool
 * index as an operand), not as literals in handler source, so we then scan the
 * recursive-descent disassembly for instructions whose operands equal a token's pool
 * index and report the containing function — the token's producing/attaching site.
 */
const fs = require("node:fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

function extractPool(beautifiedSrc) {
  const ast = parser.parse(beautifiedSrc, { sourceType: "script", errorRecovery: true });
  let A = null;
  traverse(ast, { VariableDeclarator(p) { if (p.node.id.name === "A" && p.node.init && p.node.init.type === "ArrayExpression") A = p.node.init.elements.map((e) => (e && e.type === "StringLiteral" ? e.value : "")); } });
  return A;
}

function decode(value, key) {
  let d; try { d = Buffer.from(value, "base64").toString("utf8"); } catch (_) { return null; }
  if (!key) return null;
  let r = ""; for (let i = 0; i < d.length; i++) r += String.fromCharCode(d.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  return r;
}

/** index -> token, for each target string found exactly in the pool. */
function locateTokens(pool, targets) {
  const want = new Map(targets.map((t) => [t.toLowerCase(), t]));
  const hits = new Map();
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i]) continue;
    for (let j = 0; j < pool.length; j++) {
      if (i === j || !pool[j]) continue;
      const s = decode(pool[i], pool[j]);
      if (s && want.has(s.toLowerCase())) { hits.set(i, want.get(s.toLowerCase())); break; }
    }
  }
  return hits; // Map<poolIndex, token>
}

/** For each token pool index, list function entries whose disasm loads it as an operand. */
function mapTokensToFunctions(functions, indexToToken) {
  const out = {};
  for (const f of functions) {
    for (const line of f.lines) {
      const m = line.match(/\[([0-9, ]+)\]/);
      if (!m) continue;
      for (const o of m[1].split(",").map((s) => +s.trim())) {
        if (indexToToken.has(o)) {
          const tok = indexToToken.get(o);
          (out[tok] ||= new Set()).add(f.entry);
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort((a, b) => a - b)]));
}

module.exports = { extractPool, decode, locateTokens, mapTokensToFunctions };
