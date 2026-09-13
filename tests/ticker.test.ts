import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCompanyName, normalizeTicker } from "../lib/ticker";

test("ticker normalization is shared, case-insensitive, and bounded", () => {
  assert.equal(normalizeTicker(" aapl "), "AAPL");
  assert.equal(normalizeTicker("brk.b"), "BRK.B");
  assert.equal(normalizeTicker("123456789012"), "123456789012");
  assert.equal(normalizeTicker("1234567890123"), null);
  assert.equal(normalizeTicker("AAPL?x=1"), null);
  assert.equal(normalizeTicker(""), null);
});

test("company-name normalization removes excess whitespace and caps untrusted input", () => {
  assert.equal(normalizeCompanyName("  Apple   Inc. ", "AAPL"), "Apple Inc.");
  assert.equal(normalizeCompanyName("", "AAPL"), "AAPL");
  assert.equal(normalizeCompanyName("A".repeat(200), "AAPL").length, 120);
});
