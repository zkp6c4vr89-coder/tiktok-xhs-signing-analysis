"use strict";
/**
 * CLI: apply the evaluating string-array pass (javascript-obfuscator decoder removal)
 * to a file and report stats.
 *   node run_eval.js <input.js> [output.js]
 */
const fs = require("node:fs");
const babel = {
  parser: require("@babel/parser"),
  traverse: require("@babel/traverse").default,
  types: require("@babel/types"),
  generator: require("@babel/generator").default,
};
const { removeEvalStringArray } = require("./passes/string-array-eval");

const [input, out] = process.argv.slice(2);
if (!input) { console.error("usage: node run_eval.js <input.js> [output.js]"); process.exit(2); }
const { code, stats } = removeEvalStringArray(fs.readFileSync(input, "utf8"), babel);
console.error("[eval-string-array] " + JSON.stringify(stats));
if (out) { fs.writeFileSync(out, code); console.error("[eval-string-array] wrote " + out); }
