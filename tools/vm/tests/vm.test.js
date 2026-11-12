"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const zlib = require("node:zlib");
const { decodeBytecode } = require("../decode");
const { disassemble, disassembleFunction } = require("../disasm");

test("decodeBytecode inverts base64 + raw-DEFLATE", () => {
  const original = Buffer.from([0, 0xda, 0, 0, 0x0e, 0, 8, 0, 0xaf, 0, 0, 0x34]);
  const blob = zlib.deflateRawSync(original).toString("base64");
  const out = decodeBytecode(blob);
  assert.deepStrictEqual(Buffer.from(out), original);
});

// Minimal synthetic opcode table + bytecode to exercise operand widths and
// the terminal (return) condition. uint16 opcode, then operands by `reads`.
const TABLE = [
  { op: 0, reads: "", operandBytes: 0, variadic: false, terminal: false, setsPC: false, category: "other" },
  { op: 1, reads: "p", operandBytes: 2, variadic: false, terminal: false, setsPC: false, category: "load" },
  { op: 2, reads: "Om", operandBytes: 4, variadic: false, terminal: false, setsPC: false, category: "make-function" },
  { op: 3, reads: "", operandBytes: 0, variadic: false, terminal: true, setsPC: false, category: "store" },
];

test("disassembler decodes uint16 opcodes and operands by width", () => {
  // op1 [0x1234], op0, op3(terminal)
  const bc = Buffer.from([0x00, 0x01, 0x12, 0x34, 0x00, 0x00, 0x00, 0x03]);
  const r = disassemble(bc, TABLE);
  assert.strictEqual(r.decoded, 3);
  assert.match(r.lines[0], /op1 load \[4660\]/); // 0x1234 = 4660
  assert.match(r.lines[2], /op3 store/);
});

test("disassembleFunction stops at a terminal op and exposes child entries", () => {
  // op2 make-function: O=0x07, m=0x000005 (child entry 5); then op3 terminal
  const bc = Buffer.from([0x00, 0x02, 0x07, 0x00, 0x00, 0x05, 0x00, 0x03]);
  const f = disassembleFunction(bc, TABLE, 0);
  assert.ok(f.ended, "function should end on terminal op");
  assert.deepStrictEqual(f.childEntries, [5]);
});
