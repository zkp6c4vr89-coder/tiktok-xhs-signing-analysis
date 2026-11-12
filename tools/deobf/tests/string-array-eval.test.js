"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const babel = {
  parser: require("@babel/parser"),
  traverse: require("@babel/traverse").default,
  types: require("@babel/types"),
  generator: require("@babel/generator").default,
};
const { removeEvalStringArray } = require("../passes/string-array-eval");

// Synthetic fixture in the javascript-obfuscator shape: a base64 string array, a
// rotation IIFE, a decoder that base64-decodes arr[i-offset], an ALIAS of the decoder,
// and call sites that go through the alias (as the real XHS payload does).
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const ARR = [b64("secret"), b64("x-s"), b64("md5"), b64("navigator"), b64("x-t"), b64("payload"), b64("a1"), b64("userAgent"),
  b64("w0"), b64("w1"), b64("w2"), b64("w3"), b64("w4"), b64("w5"), b64("w6"), b64("w7"), b64("w8"), b64("w9"), b64("wA"), b64("wB"), b64("wC")];
const OBF = `
var _0xARR = ${JSON.stringify(ARR)};
var _0xDEC = function (i) { return (typeof atob === "function" ? atob : function(x){return x;})(_0xARR[i - 0]); };
(function (a, b) { var r = 3; while (--r) { a.push(a.shift()); } }(_0xARR, 0x10));
var _0xALIAS = _0xDEC;
function f() { var _0xLOCAL = _0xALIAS; return [_0xLOCAL(1), _0xLOCAL(2), _0xALIAS(4)]; }
var h = _0xDEC(3);
`;

test("decoder + aliases are evaluated and calls replaced with decoded strings", () => {
  const { code, stats } = removeEvalStringArray(OBF, babel);
  assert.strictEqual(stats.arrayName, "_0xARR");
  assert.strictEqual(stats.decoderName, "_0xDEC");
  assert.ok(stats.aliasCount >= 3, "should resolve _0xDEC, _0xALIAS, _0xLOCAL");
  assert.ok(stats.replaced >= 4, `expected >=4 replacements, got ${stats.replaced}`);
  // The rotation (while(--r) with r=3 => two shifts) is applied before decoding, so the
  // call indices resolve through the rotated array. Assert the correctly-decoded tokens.
  for (const tok of ["navigator", "x-t", "a1", "payload"]) assert.ok(code.includes(`"${tok}"`) || code.includes(`'${tok}'`), `missing ${tok}`);
});

test("no array -> unchanged", () => {
  const plain = "var x = atob('aGk='); function g(a){ return a + 1; }";
  const { code, stats } = removeEvalStringArray(plain, babel);
  assert.strictEqual(stats.arrayName, null);
  assert.strictEqual(code, plain);
});
