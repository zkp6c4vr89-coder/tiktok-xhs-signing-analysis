"use strict";
/**
 * CLI: apply the string-array deobfuscation pass to a file and report stats.
 *   node run.js <input.js> [output.js] [--rotate]
 * Reads only the file given; writes deobfuscated source to output (or stdout stats only).
 * Reusable across both platforms.
 */
const fs = require("node:fs");
const babel = {
  parser: require("@babel/parser"),
  traverse: require("@babel/traverse").default,
  types: require("@babel/types"),
  generator: require("@babel/generator").default,
};
const { removeStringArray } = require("./passes/string-array");

const [input, maybeOut] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const applyRotation = process.argv.includes("--rotate");
if (!input) { console.error("usage: node run.js <input.js> [output.js] [--rotate]"); process.exit(2); }

const src = fs.readFileSync(input, "utf8");
const { code, stats } = removeStringArray(src, babel, { applyRotation });
console.error("[string-array] " + JSON.stringify(stats));
if (maybeOut) { fs.writeFileSync(maybeOut, code); console.error("[string-array] wrote " + maybeOut); }
