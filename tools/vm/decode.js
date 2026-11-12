"use strict";
/**
 * Bytecode loader for the TikTok webmssdk 1.16.x VM.
 *
 * In 1.16.6 the bytecode is shipped as a single base64 string that is
 * base64-decoded and then raw-DEFLATE-inflated at load time:
 *     g = dwInfl.dwAbA(b(BLOB))
 * where b() is a standard-alphabet base64 decoder ("+/" for 62/63) and
 * dwInfl.dwAbA() is raw inflate. We reproduce that with Node's zlib so the
 * decoding is independent of the bundle's own (obfuscated) inflate.
 *
 * This replaces the reference's shortcut of hard-coding an already-decompressed
 * Uint8Array: here the decompression step is implemented, so the pipeline is
 * reproducible from the pinned bundle.
 */
const zlib = require("node:zlib");

/** Decode the base64+deflate bytecode blob to a Buffer of VM bytes. */
function decodeBytecode(base64Blob) {
  const packed = Buffer.from(base64Blob, "base64");
  // The bundle uses raw DEFLATE (no zlib/gzip header).
  return zlib.inflateRawSync(packed);
}

/** Pull the longest string literal (the bytecode blob) out of a parsed bundle AST. */
function findBytecodeBlob(ast, traverse) {
  let big = null;
  traverse(ast, {
    StringLiteral(p) {
      if (p.node.value.length > 5000 && (!big || p.node.value.length > big.length)) big = p.node.value;
    },
  });
  return big;
}

module.exports = { decodeBytecode, findBytecodeBlob };
