import assert from "node:assert/strict";
import test from "node:test";
import { actualFiscalLabel, historicalEffectiveTaxRate, historicalRevenueGrowth, historicalUfcf, normalizedHistoricalTaxRate, type HistoricalDcfInput } from "../lib/historical-dcf";

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

test("normalized tax rate uses a multi-year median instead of the latest one-time rate", () => {
  const rows = [
    { ...row("2022", 100), incomeTax: 20, earningsBeforeTax: 100 },
    { ...row("2023", 110), incomeTax: 22, earningsBeforeTax: 100 },
    { ...row("2024", 120), incomeTax: 2, earningsBeforeTax: 100 },
    { ...row("2025", 130), incomeTax: 24, earningsBeforeTax: 100 },
  ];
  assert.equal(normalizedHistoricalTaxRate(rows), 21);
  assert.equal(normalizedHistoricalTaxRate(rows.map(({ incomeTax, earningsBeforeTax, ...value }) => value)), 21);
});
