import assert from "node:assert/strict";
import test from "node:test";
import type { CompanyData } from "../lib/company-data";
import { addYears, type DcfModel } from "../lib/dcf-engine";
import { assessDcfReliability } from "../lib/dcf-reliability";

function company(overrides: Partial<CompanyData["metrics"]> = {}): CompanyData {
  return {
    source: "Test fixture",
    asOf: "2025-12-31",
    company: { symbol: "TEST", name: "Test", description: "Test", exchange: "NYSE", currency: "USD", country: "United States", sector: "Industrials", industry: "Manufacturing" },
    market: { marketCap: 5_000, shares: 100, estimatedPrice: 50, beta: 1 },
    metrics: { revenueGrowth: 10, revenue: 1_000, ebitMargin: 15, capexPercentRevenue: 5, daPercentRevenue: 4, cash: 100, debt: 100, taxRate: 21, ...overrides },
    forecast: { year1Revenue: 1_100, year2Revenue: 1_190, year1Growth: 10, year2Growth: 8.2, source: "Consensus", sourceUrl: "https://example.com" },
    historical: [
      { year: "2023", revenue: 800, ebit: 100, ebitMargin: 12.5, operatingCashFlow: 120, capex: 40, capexPercentRevenue: 5, depreciation: 30, freeCashFlow: 80 },
      { year: "2024", revenue: 900, ebit: 120, ebitMargin: 13.3, operatingCashFlow: 140, capex: 45, capexPercentRevenue: 5, depreciation: 35, freeCashFlow: 95 },
      { year: "2025", revenue: 1_000, ebit: 150, ebitMargin: 15, operatingCashFlow: 175, capex: 50, capexPercentRevenue: 5, depreciation: 40, freeCashFlow: 125 },
    ],
  };
}

function model(finalMargin = 15): DcfModel {
  return {
    forecastDrivers: Array.from({ length: 6 }, (_, index) => ({
      periodEnd: addYears("2026-12-31", index), source: "Test", revenueGrowth: 8,
      grossMargin: 40, ebitMargin: finalMargin, taxRate: 21, daPercent: 4,
      capexPercent: 5, changeNwcPercent: 1, deferredTaxPercent: 0, otherNonCashPercent: 0,
    })),
    normalizedTaxRate: 21, riskFreeRate: 4.5, beta: 1, equityRiskPremium: 4.2,
    preTaxCostDebt: 6, companyRiskPremium: 0, terminalGrowth: 2.5, terminalRoic: 9,
    exitMultiple: 10, cash: 100, shortDebt: 0, longDebt: 100, preferredInterest: 0,
    shares: 100, marketPrice: 50, valuationDate: "2026-10-05",
  };
}

const validResult = { valid: true, invalidReason: null };

test("profitable companies with adequate data do not receive a warning", () => {
  assert.equal(assessDcfReliability(company(), model(), validResult, validResult).level, "clear");
});

test("loss-making companies receive a specific turnaround warning", () => {
  const assessment = assessDcfReliability(company({ ebitMargin: -16.1 }), model(15), validResult, validResult);
  assert.equal(assessment.level, "caution");
  assert.deepEqual(assessment.reasons.map((reason) => reason.label), ["NEGATIVE EBIT MARGIN", "TURNAROUND ASSUMED"]);
  assert.match(assessment.reasons.map((reason) => reason.detail).join(" "), /15\.0% EBIT margin/);
});

test("invalid methods block the valuation and expose the calculation reason", () => {
  const invalid = { valid: false, invalidReason: "Year-5 EBITDA must be positive." };
  const assessment = assessDcfReliability(company(), model(), invalid, invalid);
  assert.equal(assessment.level, "blocked");
  assert.deepEqual(assessment.reasons, [{ label: "INVALID INPUTS", detail: "Year-5 EBITDA must be positive." }]);
});

test("negative non-equity claims are called out for manual verification", () => {
  const assessment = assessDcfReliability(company({ preferredInterest: -2.7 }), model(), validResult, validResult);
  assert.equal(assessment.level, "caution");
  assert.equal(assessment.reasons[0].label, "DATA ISSUE");
  assert.equal(assessment.reasons[0].detail, "non-equity claims set to $0");
});
