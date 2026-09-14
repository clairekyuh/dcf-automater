import assert from "node:assert/strict";
import test from "node:test";
import type { HistoricalRow, RevenueInterimResult } from "../lib/company-data";
import { calculatedRevenueGrowth, reconcileRevenueHistory, withInterimRevenue, type AnnualRevenueSource } from "../lib/revenue-quality";

function row(fiscalDate: string, revenue: number): HistoricalRow {
  return {
    year: fiscalDate.slice(0, 4), fiscalDate, revenue, ebit: revenue * .2, ebitMargin: 20,
    operatingCashFlow: revenue * .15, capex: revenue * .05, capexPercentRevenue: 5,
    depreciation: revenue * .03, freeCashFlow: revenue * .1,
  };
}

function sec(fiscalDate: string, revenue: number, sourceAsOf = `${Number(fiscalDate.slice(0, 4)) + 1}-03-01`): AnnualRevenueSource {
  return { fiscalDate, revenue, source: "SEC Company Facts", sourceAsOf, sourceUrl: "https://www.sec.gov/", originalUnit: "USD", normalizedUnit: "USD millions" };
}

test("supports Apple-style September fiscal years and prefers matching SEC revenue", () => {
  const result = reconcileRevenueHistory([row("2024-09-28", 390_000), row("2025-09-27", 410_000)], [sec("2024-09-28", 390_000), sec("2025-09-27", 410_000)]);
  assert.equal(result.revenueData.quality, "complete");
  assert.ok(result.historical.every((period) => period.revenueSource === "SEC Company Facts"));
});

test("supports Alphabet-style December fiscal years", () => {
  const result = reconcileRevenueHistory([row("2024-12-31", 350_000), row("2025-12-31", 400_000)], []);
  assert.equal(result.revenueData.quality, "complete");
  assert.equal(calculatedRevenueGrowth(result.historical, 1)?.toFixed(1), "14.3");
});

test("supports Walmart-style January fiscal year ends without treating them as calendar years", () => {
  const result = reconcileRevenueHistory([row("2024-01-31", 648_000), row("2025-01-31", 681_000)], []);
  assert.equal(result.revenueData.quality, "complete");
  assert.equal(result.revenueData.issues.length, 0);
});

test("CoreWeave extreme growth remains valid when SEC and Nasdaq agree", () => {
  const result = reconcileRevenueHistory(
    [row("2023-12-31", 229), row("2024-12-31", 1_915), row("2025-12-31", 5_131)],
    [sec("2023-12-31", 229), sec("2024-12-31", 1_915), sec("2025-12-31", 5_131)],
  );
  assert.equal(result.revenueData.quality, "complete");
  assert.equal(calculatedRevenueGrowth(result.historical, 1)?.toFixed(1), "736.2");
  assert.equal(calculatedRevenueGrowth(result.historical, 2)?.toFixed(1), "167.9");
});

test("a recent IPO with one annual period is partial and has no fabricated growth", () => {
  const result = reconcileRevenueHistory([row("2025-12-31", 500)], [sec("2025-12-31", 500)]);
  assert.equal(result.revenueData.quality, "partial");
  assert.equal(calculatedRevenueGrowth(result.historical, 0), null);
});

test("a foreign issuer without SEC facts keeps disclosed Nasdaq annual data", () => {
  const result = reconcileRevenueHistory([row("2024-03-31", 8_000), row("2025-03-31", 8_700)], []);
  assert.equal(result.revenueData.quality, "complete");
  assert.ok(result.historical.every((period) => period.revenueSource === "Nasdaq annual financial statements"));
});

test("material SEC and Nasdaq differences are exposed while SEC remains the preferred value", () => {
  const result = reconcileRevenueHistory([row("2024-12-31", 100), row("2025-12-31", 150)], [sec("2024-12-31", 100), sec("2025-12-31", 180)]);
  assert.equal(result.revenueData.quality, "conflicting");
  assert.equal(result.historical[1].revenue, 180);
  assert.equal(result.historical[1].revenueReconciliation, "conflicting");
});

test("a likely thousand-versus-million discontinuity is flagged", () => {
  const result = reconcileRevenueHistory([row("2024-12-31", 100), row("2025-12-31", 100_000)], []);
  assert.equal(result.revenueData.quality, "partial");
  assert.match(result.revenueData.issues.join(" "), /source units/i);
});

test("conflicting fiscal year-end dates are not treated as a clean annual series", () => {
  const result = reconcileRevenueHistory([row("2024-01-31", 100), row("2025-12-31", 120)], []);
  assert.equal(result.revenueData.quality, "partial");
  assert.match(result.revenueData.issues.join(" "), /Fiscal year-end dates conflict/);
});

test("later SEC filings replace an earlier value for the same fiscal period", () => {
  const result = reconcileRevenueHistory([row("2024-12-31", 100), row("2025-12-31", 120)], [
    sec("2024-12-31", 100, "2025-03-01"),
    sec("2024-12-31", 105, "2026-03-01"),
    sec("2025-12-31", 120, "2026-03-01"),
  ]);
  assert.equal(result.historical[0].revenue, 105);
  assert.equal(result.historical[0].revenueSourceAsOf, "2026-03-01");
});

test("latest quarterly results remain separate from the annual history", () => {
  const result = reconcileRevenueHistory([row("2024-12-31", 100), row("2025-12-31", 150)], []);
  const interim: RevenueInterimResult = {
    periodStart: "2026-04-01", periodEnd: "2026-06-30", periodType: "quarter",
    revenue: 50, comparableRevenue: 40, growth: 25, source: "SEC Company Facts",
    sourceUrl: "https://www.sec.gov/", asOf: "2026-08-01",
  };
  const enriched = withInterimRevenue(result.revenueData, interim);
  assert.equal(result.historical.length, 2);
  assert.equal(enriched.latestInterim?.revenue, 50);
});
