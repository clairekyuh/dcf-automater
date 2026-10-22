import assert from "node:assert/strict";
import test from "node:test";
import { estimateTerminalRoic } from "../lib/terminal-assumptions";

test("terminal ROIC retains only a capped portion of supported historical excess returns", () => {
  const result = estimateTerminalRoic([
    { year: "2024", ebit: 100, totalAssets: 1_000, totalLiabilities: 600, debt: 200, cash: 100 },
    { year: "2025", ebit: 150, totalAssets: 1_100, totalLiabilities: 650, debt: 200, cash: 100 },
    { year: "2026", ebit: 180, totalAssets: 1_200, totalLiabilities: 700, debt: 200, cash: 100 },
  ], 20, 9);
  assert.equal(result.observations.length, 2);
  assert.ok(result.value > 9);
  assert.ok(result.value <= 15);
  assert.match(result.source, /editable model estimate/);
});

test("terminal ROIC falls back to WACC when invested capital cannot be reconciled", () => {
  const result = estimateTerminalRoic([{ year: "2026", ebit: 100 }], 21, 8.75);
  assert.equal(result.value, 8.75);
  assert.equal(result.historicalMedian, null);
  assert.match(result.source, /WACC fallback/);
});

test("negative book invested capital is not used to manufacture a terminal ROIC", () => {
  const result = estimateTerminalRoic([
    { year: "2025", ebit: 100, totalAssets: 100, totalLiabilities: 300, debt: 50, cash: 25 },
    { year: "2026", ebit: 120, totalAssets: 120, totalLiabilities: 330, debt: 50, cash: 25 },
  ], 21, 10);
  assert.equal(result.value, 10);
  assert.equal(result.observations.length, 0);
});
