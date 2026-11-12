"use strict";
/**
 * Extract the embedded signer payload from the Xiaohongshu vendor-dynamic bundle.
 *
 * The signer is shipped as a large string literal (the longest in the bundle) that the
 * bundle `eval`s. We pull it out via Babel (which decodes JS string escapes for us) and
 * write it to samples/ (git-ignored) for the deobfuscation passes and the harness.
 *
 * Usage: node extract_xhs_payload.js <vendor-dynamic.js> <out-payload.js>
 */
const fs = require("node:fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) { console.error("usage: node extract_xhs_payload.js <vendor-dynamic.js> <out.js>"); process.exit(2); }

const ast = parser.parse(fs.readFileSync(inPath, "utf8"), { sourceType: "script", errorRecovery: true });
let big = null;
traverse(ast, { StringLiteral(p) { if (p.node.value.length > 50000 && (!big || p.node.value.length > big.length)) big = p.node.value; } });
if (!big) { console.error("no embedded payload literal found"); process.exit(1); }
fs.writeFileSync(outPath, big);
console.error(`extracted ${big.length} chars -> ${outPath}`);
