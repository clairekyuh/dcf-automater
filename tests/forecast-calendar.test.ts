import assert from "node:assert/strict";
import test from "node:test";
import { completedForecastYears } from "../lib/forecast-calendar";

test("forecast calendar rolls Apple forward after its fiscal year has ended", () => {
  assert.equal(completedForecastYears("2025-09-27", "2026-07-21"), 0);
  assert.equal(completedForecastYears("2025-09-27", "2026-10-25"), 1);
});

test("forecast calendar can roll through more than one stale fiscal year", () => {
  assert.equal(completedForecastYears("2023-12-31", "2026-10-25"), 2);
});
