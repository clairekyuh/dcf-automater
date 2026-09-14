import assert from "node:assert/strict";
import test from "node:test";
import { buildOperatingSeries, buildTerminalMix, buildValuationRanges } from "../lib/dcf-visuals";
import { calculateDcf, type DcfModel } from "../lib/dcf-engine";
import type { CompanyData } from "../lib/company-data";

const model: DcfModel = {
  forecastDrivers: Array.from({ length: 6 }, (_, index) => ({ periodEnd: `${2026 + index}-12-31`, source: "Test", revenueGrowth: 5, grossMargin: 50, ebitMargin: 20, taxRate: 20, daPercent: 4, capexPercent: 5, changeNwcPercent: 1, deferredTaxPercent: 0, otherNonCashPercent: 0 })),
  normalizedTaxRate: 20, riskFreeRate: 4, beta: 1, equityRiskPremium: 5, preTaxCostDebt: 5, companyRiskPremium: 0,
  terminalGrowth: 3, terminalRoic: 10, exitMultiple: 12, cash: 100, shortDebt: 20, longDebt: 80, preferredInterest: 0,
  shares: 100, marketPrice: 20, valuationDate: "2026-01-01",
};
const data = {
  metrics: { revenue: 1000 },
  historical: [{ year: "2025", revenue: 1000, ebit: 180, ebitMargin: 18, depreciation: 40, freeCashFlow: 120, cogs: 500 }],
  market: { priceHistory: [{ date: "2025-06-01", close: 16 }, { date: "2026-01-01", close: 22 }] },
  comparison: { peers: [
    { peerFit: "direct", evToEbitda: 10, evToRevenue: 4 },
    { peerFit: "close", evToEbitda: 14, evToRevenue: 6 },
  ] },
} as unknown as CompanyData;

test("operating visuals keep actual and forecast periods distinct", () => {
  const result = calculateDcf(data, model, "perpetuity");
  const series = buildOperatingSeries(data, result);
  assert.equal(series[0].period, "actual");
  assert.equal(series[1].period, "forecast");
  assert.equal(series[0].grossMargin, 50);
  assert.equal(series[1].revenueGrowth, 5);
  assert.ok(series[1].ebitdaMargin !== null);
  assert.ok(series[1].ufcfMargin !== null);
  assert.equal(series.length, 7);
});

test("valuation ranges contain valuation methods rather than stock-trading windows", () => {
  const ranges = buildValuationRanges(data, model);
  assert.deepEqual(ranges.map((item) => item.label), ["Perpetual growth", "Exit multiple", "Comparable companies"]);
  assert.ok(ranges.every((item) => item.high >= item.low));
  assert.deepEqual(ranges.at(-1), { label: "Comparable companies", low: 40, high: 60, kind: "comps" });
});

test("comparable valuation range excludes extreme peer-multiple outliers", () => {
  const outlierData = {
    ...data,
    comparison: {
      ...data.comparison,
      peers: [
        { peerFit: "direct", evToRevenue: 4 },
        { peerFit: "direct", evToRevenue: 6 },
        { peerFit: "direct", evToRevenue: 40 },
      ],
    },
  } as unknown as CompanyData;
  const comparableRange = buildValuationRanges(outlierData, model).find((item) => item.kind === "comps");
  assert.deepEqual(comparableRange, { label: "Comparable companies", low: 40, high: 60, kind: "comps" });
});

test("terminal mix reconciles to enterprise value components", () => {
  const perpetuity = calculateDcf(data, model, "perpetuity");
  const multiple = calculateDcf(data, model, "multiple");
  const mixes = buildTerminalMix(perpetuity, multiple);
  assert.ok(mixes.every((item) => item.forecastPercent !== null && item.terminalPercent !== null));
  assert.ok(mixes.every((item) => Math.abs((item.forecastPercent || 0) + (item.terminalPercent || 0) - 100) < .001));
});
