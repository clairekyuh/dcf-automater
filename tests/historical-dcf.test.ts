import assert from "node:assert/strict";
import test from "node:test";
import { actualFiscalLabel, historicalEffectiveTaxRate, historicalRevenueGrowth, historicalUfcf, type HistoricalDcfInput } from "../lib/historical-dcf";

const row = (year: string, revenue: number): HistoricalDcfInput => ({ year, fiscalDate: `${year}-12-31`, revenue, operatingCashFlow: 100, capex: 30 });

test("historical revenue growth uses the preceding actual fiscal year", () => {
  const rows = [row("2023", 100), row("2024", 120), row("2025", 150)];
  assert.equal(historicalRevenueGrowth(rows, 0), null);
  assert.ok(Math.abs((historicalRevenueGrowth(rows, 2) || 0) - 25) < 1e-12);
});

test("historical UFCF converts reported cash flow to an unlevered approximation", () => {
  const result = historicalUfcf({ ...row("2025", 150), interestExpense: 10, incomeTax: 25, earningsBeforeTax: 100 }, 21);
  assert.equal(historicalEffectiveTaxRate({ ...row("2025", 150), incomeTax: 25, earningsBeforeTax: 100 }), 25);
  assert.equal(result, 77.5);
});

test("historical fiscal headers are clearly marked actual", () => {
  assert.equal(actualFiscalLabel({ year: "2025", fiscalDate: "2025-09-27" }), "SEP 25 A");
});
