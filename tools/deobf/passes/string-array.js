"use strict";
/**
 * Reusable pass: string-array indirection removal.
 *
 * This reproduces and generalises the technique used in the reference TikTok
 * analysis (notemrovsky/tiktok-reverse-engineering, deobf/deobf.js), where
 * obfuscated code hides string/number literals behind one or two global arrays
 * accessed as `ARR[n]`, and the pass replaces each lookup with the concrete
 * literal value.
 *
 * It handles the two shapes that account for almost all "javascript-obfuscator"
 * style string hiding, so it is reusable across both platforms in this study:
 *
 *   1. Direct array indexing:     ARR[123]           -> "navigator"
 *   2. Decoder-function indexing: dec(123)           -> "navigator"
 *      where `function dec(i){ return ARR[i - OFFSET]; }` (constant offset).
 *
 * Optionally, a rotation IIFE that permutes ARR before use
 * (`while(...) ARR.push(ARR.shift())` guarded by a checksum) is applied first by
 * evaluating it in an isolated VM sandbox, so ARR holds its post-rotation order.
 *
 * The caller passes the Babel primitives in (parser/traverse/types), so this file
 * has no hard dependency and is trivial to unit-test. Nothing here executes
 * bundle code except an optional, sandboxed rotation step the caller must opt in
 * to with { applyRotation: true }.
 */

const vm = require("node:vm");

/**
 * @param {string} code                 source to transform
 * @param {object} babel                { parser, traverse, types, generator }
 * @param {object} [opts]
 * @param {string} [opts.arrayName]      name of the string array; auto-detected if omitted
 * @param {string} [opts.decoderName]    name of a decoder function; auto-detected if omitted
 * @param {boolean} [opts.applyRotation] evaluate a rotation IIFE in a sandbox first
 * @returns {{ code: string, stats: object }}
 */
function removeStringArray(code, babel, opts = {}) {
  const { parser, traverse, types: t, generator } = babel;
  const ast = parser.parse(code, { sourceType: "script", errorRecovery: true });

  const stats = { arrayName: null, decoderName: null, offset: 0, replacedArrayIndex: 0, replacedDecoderCall: 0 };

  // --- 1. Find the string array: var X = ["...", "...", ...] (mostly string literals) ---
  let arrayName = opts.arrayName || null;
  let arrayValues = null;
  traverse(ast, {
    VariableDeclarator(p) {
      const id = p.node.id, init = p.node.init;
      if (!t.isIdentifier(id) || !t.isArrayExpression(init)) return;
      const els = init.elements;
      if (els.length < (opts.minArraySize || 20)) return;
      const strCount = els.filter((e) => t.isStringLiteral(e) || t.isNumericLiteral(e)).length;
      if (strCount / els.length < 0.8) return; // mostly literals
      if (arrayName && id.name !== arrayName) return;
      if (!arrayValues || els.length > arrayValues.length) {
        arrayName = id.name;
        arrayValues = els.map((e) => (e && (t.isStringLiteral(e) || t.isNumericLiteral(e)) ? e.value : undefined));
      }
    },
  });
  if (!arrayName) return { code, stats };
  stats.arrayName = arrayName;

  // --- optional rotation: run the full source in a sandbox and read ARR back ---
  if (opts.applyRotation) {
    try {
      const sandbox = {};
      vm.createContext(sandbox);
      vm.runInContext(code + `;globalThis.__arr=${arrayName};`, sandbox, { timeout: 1000 });
      if (Array.isArray(sandbox.__arr)) arrayValues = sandbox.__arr.slice();
    } catch (_) { /* fall back to static order */ }
  }

  // --- 2. Find a decoder function: function dec(i){ return ARR[i - OFFSET]; } ---
  let decoderName = opts.decoderName || null;
  let offset = 0;
  traverse(ast, {
    FunctionDeclaration(p) {
      const body = p.node.body.body;
      if (body.length !== 1 || !t.isReturnStatement(body[0])) return;
      const arg = body[0].argument;
      if (!t.isMemberExpression(arg) || !t.isIdentifier(arg.object, { name: arrayName })) return;
      // index is `i` or `i - N` or `i + N`
      let off = 0;
      if (t.isBinaryExpression(arg.property) && t.isNumericLiteral(arg.property.right)) {
        off = arg.property.operator === "-" ? arg.property.right.value : -arg.property.right.value;
      }
      if (decoderName && p.node.id.name !== decoderName) return;
      decoderName = p.node.id.name;
      offset = off;
    },
  });
  stats.decoderName = decoderName;
  stats.offset = offset;

  const lit = (v) => (typeof v === "number" ? t.valueToNode(v) : t.stringLiteral(String(v)));

  // --- 3. Replace ARR[n] and dec(n) with literals ---
  traverse(ast, {
    MemberExpression(p) {
      if (!t.isIdentifier(p.node.object, { name: arrayName })) return;
      if (!p.node.computed || !t.isNumericLiteral(p.node.property)) return;
      if (p.parentPath.isAssignmentExpression({ left: p.node })) return; // don't rewrite lvalues
      const v = arrayValues[p.node.property.value];
      if (v === undefined) return;
      try { p.replaceWith(lit(v)); stats.replacedArrayIndex++; } catch (_) { /* leave as-is */ }
    },
    CallExpression(p) {
      if (!decoderName) return;
      if (!t.isIdentifier(p.node.callee, { name: decoderName })) return;
      if (p.node.arguments.length !== 1 || !t.isNumericLiteral(p.node.arguments[0])) return;
      const v = arrayValues[p.node.arguments[0].value - offset];
      if (v === undefined) return;
      try { p.replaceWith(lit(v)); stats.replacedDecoderCall++; } catch (_) { /* leave as-is */ }
    },
  });

  const out = generator(ast, { comments: true, compact: false }).code;
  return { code: out, stats };
}

module.exports = { removeStringArray };
