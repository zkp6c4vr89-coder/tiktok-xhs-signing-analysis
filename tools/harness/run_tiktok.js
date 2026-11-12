"use strict";
/**
 * Runtime trace of webmssdk 1.16.x in Node, offline.
 *
 * Loads the (beautified) bundle in a node:vm context whose global is the logging
 * browser shim, with two instrumentation hooks injected into the source:
 *   - the VM string decoder l(n,t)  -> every decoded string is logged with its key;
 *   - the VM dispatch d[f](u)       -> every executed opcode is counted, with the
 *                                      current function entry offset (u.I at call).
 * We then drive the signing entry point if the SDK exposes one. Outputs: the
 * fingerprint surface (browser reads), the decoded-string table, and an opcode/
 * function execution profile. No network, no real data.
 *
 * Usage: node tools/harness/run_tiktok.js
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { makeEnv } = require("./env");

const ROOT = path.resolve(__dirname, "..", "..");
let src = fs.readFileSync(path.join(ROOT, "samples", "webmssdk.1.16.6.beautified.js"), "utf8");

// --- inject hooks (textual, against known-unique source lines) ---
// 1) decoder l(n,t): log (key, decoded) after it computes r.
const L_MARK = "r += String.fromCharCode(n.charCodeAt(i) ^ t.charCodeAt(i % t.length));\n        return r;";
if (src.includes(L_MARK)) {
  src = src.replace(L_MARK, L_MARK.replace("return r;", "try { globalThis.__dec && globalThis.__dec(t, r); } catch (e) {} return r;"));
} else { console.error("WARN: decoder hook mark not found"); }
// 2) dispatch d[f](u): count opcode f and record function offset.
const D_MARK = "d[f](u);";
if (src.includes(D_MARK)) {
  src = src.replace(D_MARK, "try { globalThis.__vm && globalThis.__vm(f, u.I); } catch (e) {} d[f](u);");
} else { console.error("WARN: dispatch hook mark not found"); }

// --- instrumentation sinks ---
const decoded = new Map();       // decoded string -> count
const opCount = new Map();       // opcode -> count
let dispatches = 0;
const env = makeEnv();
env.raw.__dec = (key, s) => { if (s && typeof s === "string") decoded.set(s, (decoded.get(s) || 0) + 1); };
env.raw.__vm = (f) => { dispatches++; opCount.set(f, (opCount.get(f) || 0) + 1); };
// common globals the bundle expects at top level
env.raw.console = { log() {}, warn() {}, error() {}, info() {} };
env.raw.TextEncoder = TextEncoder; env.raw.TextDecoder = TextDecoder;
env.raw.Function = Function;
// network/DOM constructors the SDK references at init — inert stubs (no network)
const Noop = function () { return {}; };
for (const k of ["Request", "Response", "Headers", "Blob", "FormData", "WebSocket", "XMLHttpRequest", "MutationObserver", "PerformanceObserver", "RTCPeerConnection", "webkitRTCPeerConnection", "mozRTCPeerConnection", "Worker", "Event", "CustomEvent", "Image"]) env.raw[k] = Noop;
env.raw.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve("") });
env.raw.msCrypto = env.raw.crypto;
env.raw.URL = URL; env.raw.URLSearchParams = URLSearchParams;
env.raw.requestAnimationFrame = (cb) => { return 0; }; env.raw.cancelAnimationFrame = () => {};
env.raw.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
env.raw.getComputedStyle = () => ({ getPropertyValue: () => "" });
env.raw.queueMicrotask = queueMicrotask; env.raw.structuredClone = (x) => x;
for (const k of ["Notification", "indexedDB", "BroadcastChannel", "AudioContext", "webkitAudioContext", "OffscreenCanvas"]) env.raw[k] = Noop;
// route top-level global reads through the OBSERVED proxies so the fingerprint
// surface is recorded (the bundle reads navigator/document/... as bare globals).
env.raw.window = env.window;
for (const k of ["navigator", "document", "screen", "location", "localStorage", "sessionStorage", "history", "performance", "crypto"]) env.raw[k] = env.window[k];

const context = vm.createContext(env.raw);
let runError = null;
try {
  vm.runInContext(src, context, { timeout: 15000, filename: "webmssdk.beautified.js" });
} catch (e) { runError = e; }

// --- try to drive a signing entry point, if present ---
let signAttempt = "no entry point found";
try {
  const w = env.raw;
  const acr = w.byted_acrawler || (w._mssdk && w._mssdk);
  if (w.byted_acrawler && typeof w.byted_acrawler.frontierSign === "function") {
    w.byted_acrawler.frontierSign({ url: "https://www.tiktok.com/api/x", headers: {} });
    signAttempt = "called byted_acrawler.frontierSign";
  } else if (w._mssdk) { signAttempt = "_mssdk present: " + Object.keys(w._mssdk).join(","); }
} catch (e) { signAttempt = "entry-point call threw: " + e.message; }

// --- report ---
const outDir = path.join(ROOT, "analysis", "tiktok");
const decArr = [...decoded.entries()].map(([s, n]) => ({ s, n })).sort((a, b) => b.n - a.n);
// drop our own hooks and JS builtins from the fingerprint surface; keep browser APIs
const BUILTIN = /^(__vm|__dec|Math|Date|JSON|Object|Array|String|Number|Boolean|Error|TypeError|RegExp|Symbol|Promise|Map|Set|WeakMap|parseInt|parseFloat|isNaN|Uint8Array|Uint16Array|Uint32Array|Int32Array|Float64Array|ArrayBuffer|DataView|TextEncoder|TextDecoder|Function|encodeURIComponent|decodeURIComponent)(\b|\.|\(|$)/;
const reads = [...env.reads.entries()].map(([p, n]) => ({ path: p, n })).filter((r) => !BUILTIN.test(r.path) && !r.path.includes("(in)") && !r.path.startsWith(".")).sort((a, b) => b.n - a.n);
fs.writeFileSync(path.join(outDir, "trace_decoded_strings.json"), JSON.stringify(decArr.map((d) => d.s), null, 0) + "\n");
fs.writeFileSync(path.join(outDir, "trace_fingerprint_reads.json"), JSON.stringify(reads, null, 2) + "\n");

const TOK = /bogus|gnarly|strdata|md5|sha|aes|rc4|sign|token|report|magic|canvas|webgl|audio|font|x-ms|x-argus|x-gorgon|x-ladon|navigator|platform|useragent|cookie|device|timezone|battery/i;
console.log(`load: ${runError ? "threw after init (" + runError.message.slice(0, 80) + ")" : "completed"}`);
console.log(`dispatches: ${dispatches} | distinct opcodes executed: ${opCount.size} | decoded strings: ${decoded.size}`);
console.log(`sign attempt: ${signAttempt}`);
console.log(`fingerprint reads (distinct paths): ${env.reads.size}`);
console.log("\n## decoded strings matching tokens of interest:");
[...new Set(decArr.map((d) => d.s))].filter((s) => TOK.test(s)).slice(0, 80).forEach((s) => console.log("  " + JSON.stringify(s)));
console.log("\n## top 25 fingerprint reads:");
reads.slice(0, 25).forEach((r) => console.log(`  ${r.n}x  ${r.path}`));
