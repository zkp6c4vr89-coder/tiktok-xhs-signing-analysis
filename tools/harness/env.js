"use strict";
/**
 * Logging Proxy environment shim (reusable across TikTok and Xiaohongshu).
 *
 * Builds a fake browser global (window/document/navigator/screen/...) where every
 * property *read* is recorded. Running a signing bundle against this shim yields the
 * exact fingerprint surface the code touches — the list is itself a finding (brief B2).
 *
 * Nothing here contacts the network or uses real device data: every value is a fixed,
 * synthetic stub, so traces are deterministic and contain no personal data.
 */

function makeRecorder() {
  const reads = new Map(); // "path" -> count
  const record = (path) => reads.set(path, (reads.get(path) || 0) + 1);
  return { reads, record };
}

// Wrap an object so reads are logged under a dotted path. Functions/objects returned
// are themselves wrapped so nested access (navigator.userAgent) is captured too.
function observe(target, path, record, depth = 0) {
  if (depth > 4 || target === null || (typeof target !== "object" && typeof target !== "function")) return target;
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === "symbol") return obj[prop];
      const p = path ? `${path}.${String(prop)}` : String(prop);
      record(p);
      const v = obj[prop];
      if (typeof v === "function") return v.bind(obj);
      return observe(v, p, record, depth + 1);
    },
    has(obj, prop) { record(`${path}.${String(prop)}(in)`); return prop in obj; },
  });
}

/** Fixed, synthetic browser values. No real device data. */
function baseWindow() {
  const navigator = {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "MacIntel", language: "en-US", languages: ["en-US", "en"],
    hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, vendor: "Google Inc.",
    webdriver: false, plugins: { length: 0 }, mimeTypes: { length: 0 },
    cookieEnabled: true, doNotTrack: null, product: "Gecko", appName: "Netscape",
    appVersion: "5.0 (Macintosh)", appCodeName: "Mozilla", onLine: true,
  };
  const screen = { width: 1512, height: 982, availWidth: 1512, availHeight: 944, colorDepth: 30, pixelDepth: 30 };
  const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
  const win = {
    navigator, screen,
    location: { href: "https://www.tiktok.com/", origin: "https://www.tiktok.com", protocol: "https:", host: "www.tiktok.com", hostname: "www.tiktok.com", pathname: "/", search: "", hash: "" },
    document: {
      cookie: "", referrer: "", title: "TikTok", readyState: "complete", visibilityState: "visible", characterSet: "UTF-8",
      createElement: () => ({ style: {}, getContext: () => null, setAttribute() {}, appendChild() {} }),
      getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {}, documentElement: { style: {} }, body: {},
    },
    localStorage: storage(), sessionStorage: storage(),
    history: { length: 1, pushState() {}, replaceState() {} },
    performance: { now: () => 12345.6, timeOrigin: 1600000000000, getEntriesByType: () => [], mark() {}, measure() {} },
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 2654435761) >>> 0 & 0xff; return a; }, subtle: {} },
    addEventListener() {}, removeEventListener() {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    Date, Math, JSON, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    Uint8Array, Uint16Array, Uint32Array, Int32Array, Float64Array, ArrayBuffer, DataView, Array, Object, String, Number, Boolean, Error, TypeError, RegExp, Symbol, Promise, Map, Set, WeakMap,
    screenX: 0, screenY: 0, innerWidth: 1512, innerHeight: 800, outerWidth: 1512, outerHeight: 944, devicePixelRatio: 2,
    TextEncoder, TextDecoder,
  };
  win.window = win; win.self = win; win.top = win; win.globalThis = win;
  return win;
}

/** Build a recorded window plus the recorder. deterministic Date: fixedNow (ms). */
function makeEnv({ fixedNow = 1700000000000 } = {}) {
  const { reads, record } = makeRecorder();
  const win = baseWindow();
  // deterministic time
  const FixedDate = class extends Date { constructor(...a) { if (a.length === 0) super(fixedNow); else super(...a); } static now() { return fixedNow; } };
  win.Date = FixedDate;
  const observed = observe(win, "", record);
  return { window: observed, raw: win, reads, record, fixedNow };
}

module.exports = { makeEnv, observe };
