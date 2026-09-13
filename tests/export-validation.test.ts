import assert from "node:assert/strict";
import test from "node:test";
import { validateExportPayload, validateExportRequestHeaders } from "@/lib/export/validate-export";

const validPayload = () => ({
  company: { symbol: "AAPL", name: "Apple Inc." },
  metrics: { revenue: 400_000 },
  historical: [],
  model: {
    valuationDate: "2026-09-11", marketPrice: 200, shares: 15_000, cash: 50_000,
    shortDebt: 10_000, longDebt: 80_000, preferredInterest: 0, beta: 1.1,
    riskFreeRate: 4.2, equityRiskPremium: 4.5, preTaxCostDebt: 4, normalizedTaxRate: 18,
    companyRiskPremium: 0, terminalGrowth: 3, terminalRoic: 9, exitMultiple: 15,
    forecastDrivers: Array.from({ length: 6 }, (_, index) => ({
      periodEnd: `${2027 + index}-09-30`, revenueGrowth: 5, grossMargin: 45,
      ebitMargin: 25, taxRate: 18, daPercent: 3, capexPercent: 4,
      changeNwcPercent: 2, deferredTaxPercent: 0, otherNonCashPercent: 0,
      source: "Automatic model estimate",
    })),
  },
});

test("accepts a bounded finite export payload", () => {
  assert.equal(validateExportPayload(validPayload()), null);
});

test("rejects non-finite model inputs", () => {
  const payload = validPayload();
  payload.model.marketPrice = Number.POSITIVE_INFINITY;
  assert.match(validateExportPayload(payload) || "", /non-finite|invalid numeric/i);
});

test("rejects oversized peer arrays", () => {
  const payload = { ...validPayload(), comparison: { peers: Array.from({ length: 21 }, (_, index) => ({ symbol: `P${index}` })) } };
  assert.match(validateExportPayload(payload) || "", /20 peers/i);
});

test("requires JSON and caps declared request size", () => {
  assert.match(validateExportRequestHeaders(new Request("https://example.test", { method: "POST", headers: { "content-type": "text/plain" } })) || "", /application\/json/i);
  assert.match(validateExportRequestHeaders(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json", "content-length": "1000001" } })) || "", /too large/i);
});
