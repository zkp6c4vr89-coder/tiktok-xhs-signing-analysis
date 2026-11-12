"use strict";
/**
 * Reusable pass: evaluating string-array decoder removal (javascript-obfuscator).
 *
 * The heavy "javascript-obfuscator" preset hides every string behind a decoder:
 *     var _0xARR = ['..','..', ...];                         // string array
 *     (function (a, b) { ... a.push(a.shift()); ... }(_0xARR, 0x1a2));  // rotation
 *     var _0xDEC = function (i, k) { ... return _0xARR[i - OFF] ... };  // decoder
 *     ... _0xDEC(0x0, 'salt') ...                            // call sites
 * The decoder commonly base64-decodes and/or RC4-decrypts the pooled entry with the
 * second argument as a key, so the mapping cannot be reproduced by static indexing
 * (our simpler string-array pass). Instead we isolate the array + rotation + decoder,
 * evaluate just those in a sandboxed node:vm context to obtain a live decode(), and
 * replace every decoder call that has literal arguments with the decoded string.
 *
 * Only the self-contained decoder prelude is executed, never the signer body, and the
 * sandbox has no require/network and a short timeout. Caller passes babel in.
 */
const vm = require("node:vm");

function removeEvalStringArray(code, babel, opts = {}) {
  const { parser, traverse, types: t, generator } = babel;
  const ast = parser.parse(code, { sourceType: "script", errorRecovery: true });
  const stats = { arrayName: null, decoderName: null, replaced: 0, failed: 0 };

  // 1. string array: var _0x.. = [ mostly strings ]
  let arrayName = opts.arrayName || null, arrayNode = null;
  traverse(ast, { VariableDeclarator(p) {
    if (!t.isIdentifier(p.node.id) || !t.isArrayExpression(p.node.init)) return;
    const els = p.node.init.elements;
    if (els.length < 20) return;
    const strish = els.filter((e) => e && (t.isStringLiteral(e) || t.isNumericLiteral(e))).length;
    if (strish / els.length < 0.8) return;
    if (!arrayNode || els.length > arrayNode.elements.length) { arrayName = p.node.id.name; arrayNode = p.node.init; }
  }});
  if (!arrayName) return { code, stats };
  stats.arrayName = arrayName;

  // 2. decoder = a top-level function that references the array in its body
  //    (detected by structure, not call count: all real calls go through aliases).
  let decoderName = opts.decoderName || null;
  for (const node of ast.program.body) {
    let name, fn;
    if (t.isFunctionDeclaration(node)) { name = node.id && node.id.name; fn = node; }
    else if (t.isVariableDeclaration(node)) { const d = node.declarations[0]; if (d && t.isIdentifier(d.id) && (t.isFunctionExpression(d.init) || t.isArrowFunctionExpression(d.init))) { name = d.id.name; fn = d.init; } }
    if (name && fn && bodyReferences(fn, arrayName, t)) { decoderName = name; break; }
  }
  if (!decoderName) return { code, stats };
  stats.decoderName = decoderName;

  // 2b. resolve aliases transitively: any `X = decoder-or-known-alias` makes X an alias.
  const aliases = new Set([decoderName]);
  let grew = true;
  while (grew) {
    grew = false;
    traverse(ast, { VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && t.isIdentifier(p.node.init) && aliases.has(p.node.init.name) && !aliases.has(p.node.id.name)) { aliases.add(p.node.id.name); grew = true; }
    }});
  }
  stats.aliasCount = aliases.size;

  // 3. build the decoder prelude (array decl + any IIFE/statement that mentions the
  //    array or decoder, in source order) and evaluate it in a sandbox.
  const preludeSrc = collectPrelude(ast, arrayName, decoderName, { traverse, t, generator });
  let decode;
  try {
    const sandbox = {
      console: { log() {}, warn() {}, error() {} },
      atob: (s) => Buffer.from(s, "base64").toString("binary"),
      btoa: (s) => Buffer.from(s, "binary").toString("base64"),
      unescape, escape, parseInt, parseFloat, String, Number, Array, Object, Math, JSON, Date, RegExp, isNaN,
    };
    sandbox.window = sandbox; sandbox.global = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(preludeSrc + `;globalThis.__decode=${decoderName};`, sandbox, { timeout: 2000 });
    decode = sandbox.__decode;
    if (typeof decode !== "function") throw new Error("decoder not a function");
  } catch (e) { stats.error = e.message; return { code, stats }; }

  // 4. replace calls to the decoder or any alias (literal args) with the decoded value
  traverse(ast, { CallExpression(p) {
    if (!t.isIdentifier(p.node.callee) || !aliases.has(p.node.callee.name)) return;
    const args = p.node.arguments;
    if (!args.every((a) => t.isStringLiteral(a) || t.isNumericLiteral(a))) return;
    try {
      const val = decode(...args.map((a) => a.value));
      if (typeof val === "string") { p.replaceWith(t.stringLiteral(val)); stats.replaced++; }
      else if (typeof val === "number") { p.replaceWith(t.valueToNode(val)); stats.replaced++; }
    } catch (_) { stats.failed++; }
  }});

  const out = generator(ast, { comments: true, compact: false }).code;
  return { code: out, stats };
}

function bodyReferences(fnNode, name, t) {
  let hit = false;
  (function walk(n) { if (!n || typeof n.type !== "string" || hit) return; if (t.isIdentifier(n) && n.name === name) { hit = true; return; } for (const k of Object.keys(n)) { if (k === "loc") continue; const c = n[k]; (Array.isArray(c) ? c : [c]).forEach((x) => x && typeof x.type === "string" && walk(x)); } })(fnNode.body || fnNode);
  return hit;
}

// The decoder prelude: top-level statements from the start up to AND INCLUDING the
// rotation IIFE (an expression statement that calls a function whose body rotates the
// array via shift/push under a parseInt checksum). This captures the string array, the
// decoder, any aliases, and the rotation — but stops before the signer body, which we
// must not execute.
function collectPrelude(ast, arrayName, decoderName, { generator, t }) {
  const parts = [];
  for (const node of ast.program.body) {
    parts.push(generator(node, { compact: false }).code);
    const isRotation = t.isExpressionStatement(node) && t.isCallExpression(node.expression) &&
      /shift\(\)|push\(/.test(generator(node, { compact: true }).code) && /parseInt|while/.test(generator(node, { compact: true }).code);
    if (isRotation) break;
  }
  return parts.join("\n");
}

module.exports = { removeEvalStringArray };
