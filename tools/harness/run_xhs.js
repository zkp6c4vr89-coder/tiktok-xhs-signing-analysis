"use strict";
/**
 * Runtime trace / test-vector generator for the Xiaohongshu (RedNote) web signer.
 *
 * Loads the extracted signer payload (samples/xhs/signer_payload.js) in a node:vm
 * context on the logging browser shim, discovers which globals it defines
 * (window.sign / _webmsxyw / window.f), then calls the signer on FIXED inputs with a
 * stubbed a1 cookie, a fixed timestamp, and deterministic randomness. Outputs the
 * produced header object (a test vector), the fingerprint surface, and errors.
 *
 * No network, no real account data. The a1 value is a synthetic constant.
 *
 * Usage: node tools/harness/run_xhs.js
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { makeEnv } = require("./env");

const ROOT = path.resolve(__dirname, "..", "..");
const payload = fs.readFileSync(path.join(ROOT, "samples", "xhs", "signer_payload.js"), "utf8");

const env = makeEnv({ fixedNow: 1700000000000 });
const w = env.raw;
// deterministic randomness
let seed = 0x2545f491;
w.Math = Object.create(Math); w.Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
// a synthetic a1 cookie + the other ids the signer reads (no real data)
w.document = env.window.document;
Object.defineProperty(w.document, "cookie", { value: "a1=0192f3c4d5e6a7b8c9d0e1f2g3h4i5j6k7l8m9n0; webId=deadbeefcafebabedecafbad00000000; gid=0000000000000000", writable: true, configurable: true });
w.console = { log() {}, warn() {}, error() {}, info() {} };
for (const k of ["TextEncoder", "TextDecoder", "Function", "Uint8Array", "Uint32Array", "Int32Array", "ArrayBuffer", "DataView"]) w[k] = global[k];
w.atob = (s) => Buffer.from(s, "base64").toString("binary");
w.btoa = (s) => Buffer.from(s, "binary").toString("base64");
w.unescape = unescape; w.escape = escape;
const Noop = function () { return {}; };
for (const k of ["Request", "Response", "Headers", "Blob", "WebSocket", "XMLHttpRequest", "MutationObserver"]) w[k] = Noop;

const before = new Set(Object.keys(w));
const context = vm.createContext(w);
let loadErr = null;
try { vm.runInContext(payload, context, { timeout: 15000, filename: "xhs_signer_payload.js" }); }
catch (e) { loadErr = e; }
const added = Object.keys(w).filter((k) => !before.has(k));

// find signer candidates among the newly defined globals
const fns = added.filter((k) => typeof w[k] === "function");
let vector = null, signName = null, signErr = null;
const URL_IN = "/api/sns/web/v1/feed?source=explore";
const BODY_IN = { source_note_id: "0".repeat(24), image_formats: ["jpg", "webp"] };
for (const name of ["sign", "_webmsxyw", ...fns]) {
  if (typeof w[name] !== "function") continue;
  try {
    const out = w[name](URL_IN, BODY_IN);
    if (out && typeof out === "object") { vector = out; signName = name; break; }
  } catch (e) { signErr = `${name}: ${e.message}`; }
}

const outDir = path.join(ROOT, "analysis", "xhs");
fs.mkdirSync(outDir, { recursive: true });
const reads = [...env.reads.entries()].map(([p, n]) => ({ path: p, n }))
  .filter((r) => !/^(__|Math|Date|JSON|Object|Array|String|Number|Function|parseInt|parseFloat|Uint|Int32|ArrayBuffer|DataView|TextEncoder|TextDecoder)(\b|\.|\(|$)/.test(r.path) && !r.path.includes("(in)") && !r.path.startsWith("."))
  .sort((a, b) => b.n - a.n);
fs.writeFileSync(path.join(outDir, "trace_fingerprint_reads.json"), JSON.stringify(reads, null, 2) + "\n");

console.log(`payload load: ${loadErr ? "threw (" + loadErr.message.slice(0, 90) + ")" : "ok"}`);
console.log(`globals defined by payload: ${added.join(", ") || "(none)"}`);
console.log(`signer called: ${signName || "none"}${signErr ? " | lastErr: " + signErr : ""}`);
console.log(`output header object: ${vector ? JSON.stringify(vector).slice(0, 300) : "none"}`);
console.log(`fingerprint reads (distinct): ${reads.length}`);
reads.slice(0, 20).forEach((r) => console.log(`  ${r.n}x ${r.path}`));
if (vector) fs.writeFileSync(path.join(ROOT, "analysis", "xhs", "trace_sign_output.json"), JSON.stringify({ url: URL_IN, body: BODY_IN, fixedNow: 1700000000000, signer: signName, output: vector }, null, 2) + "\n");
