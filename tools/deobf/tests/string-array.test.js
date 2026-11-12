"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const babel = {
  parser: require("@babel/parser"),
  traverse: require("@babel/traverse").default,
  types: require("@babel/types"),
  generator: require("@babel/generator").default,
};
const { removeStringArray } = require("../passes/string-array");

// Synthetic fixture in the same shape as the reference's obfuscation:
// a string array, a decoder with a constant offset, and both direct and
// decoder-mediated lookups. (We author the fixture because the reference only
// published its *post*-deobfuscation output, so there is no original to diff.)
const OBF = `
var ARR = ["navigator", "userAgent", "X-Bogus", "md5", 2654435769];
function dec(i) { return ARR[i - 100]; }
var a = ARR[0];
var b = dec(101);
var c = { ua: ARR[1], sig: dec(102), algo: dec(103), magic: ARR[4] };
`;

test("direct array indexing is resolved to literals", () => {
  const { code, stats } = removeStringArray(OBF, babel, { minArraySize: 5 });
  assert.strictEqual(stats.arrayName, "ARR");
  assert.match(code, /a = "navigator"/);
  assert.match(code, /ua: "userAgent"/);
  assert.match(code, /magic: 2654435769/);
  assert.ok(stats.replacedArrayIndex >= 3);
});

test("decoder-function indexing is resolved with the detected offset", () => {
  const { code, stats } = removeStringArray(OBF, babel, { minArraySize: 5 });
  assert.strictEqual(stats.decoderName, "dec");
  assert.strictEqual(stats.offset, 100);
  assert.match(code, /b = "userAgent"/);   // dec(101) -> ARR[1]
  assert.match(code, /sig: "X-Bogus"/);    // dec(102) -> ARR[2]
  assert.match(code, /algo: "md5"/);       // dec(103) -> ARR[3]
  assert.ok(stats.replacedDecoderCall >= 3);
});

test("no string array present -> source returned unchanged", () => {
  const plain = "var x = 1 + 2; function f(a){ return a; }";
  const { code, stats } = removeStringArray(plain, babel);
  assert.strictEqual(stats.arrayName, null);
  assert.strictEqual(code, plain);
});

test("rotation IIFE is applied before resolving (sandboxed)", () => {
  // ARR is rotated once at load; after rotation ARR[0] === "b".
  const rotated = `
var ARR = ["a", "b", "c", "d", "e", "f"];
(function(){ ARR.push(ARR.shift()); })();
var first = ARR[0];
`;
  const { code } = removeStringArray(rotated, babel, { applyRotation: true, minArraySize: 5 });
  assert.match(code, /first = "b"/);
});
