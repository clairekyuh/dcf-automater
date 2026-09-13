import assert from "node:assert/strict";
import test from "node:test";
import type { CompanyData } from "../lib/company-data";
import type { DcfModel } from "../lib/dcf-engine";
import { financialSectorRiskAnalysis, riskAnalysis, type RiskValuationResult } from "../lib/risk-analysis";

function company(overrides: { symbol?: string; country?: string; niche?: string; capex?: number; debt?: number; margin?: number; forecast?: boolean } = {}): CompanyData {
  const margin = overrides.margin ?? 12;
  return {
    source: "Test data",
    asOf: "2025-12-31",
    company: {
      symbol: overrides.symbol || "TEST",
      name: "Test Company",
      description: overrides.niche || "Consumer products",
      exchange: "NASDAQ",
      currency: "USD",
      country: overrides.country || "United States",
      sector: "Consumer",
      industry: overrides.niche || "Consumer products",
    },
    market: { marketCap: 1_000, shares: 100, estimatedPrice: 10, beta: 1 },
    metrics: {
      revenueGrowth: 8,
      revenue: 1_000,
      ebitMargin: margin,
      capexPercentRevenue: overrides.capex ?? 4,
      daPercentRevenue: 3,
      cash: 100,
      debt: overrides.debt ?? 100,
      taxRate: 21,
    },
    forecast: overrides.forecast === false ? null : {
      year1Revenue: 1_080,
      year2Revenue: 1_150,
      year1Growth: 8,
      year2Growth: 6.5,
      source: "Test forecast",
      sourceUrl: "https://example.test",
    },
    comparison: {
      company: { symbol: "TEST", name: "Test Company", description: "Test", sector: "Consumer", industry: "Consumer products", marketCap: 1_000, revenueGrowth: 8, operatingMargin: margin, evToRevenue: 1, evToEbitda: 8, pe: 12 },
      peers: [],
      selectedPeerSymbols: [],
      industryGrowthRate: null,
      nicheLabel: overrides.niche || "Consumer products",
    },
    historical: [
      { year: "2024", revenue: 900, ebit: 90, ebitMargin: 10, operatingCashFlow: 100, capex: 36, capexPercentRevenue: 4, depreciation: 27, freeCashFlow: 64 },
      { year: "2025", revenue: 1_000, ebit: margin * 10, ebitMargin: margin, operatingCashFlow: 120, capex: (overrides.capex ?? 4) * 10, capexPercentRevenue: overrides.capex ?? 4, depreciation: 30, freeCashFlow: 80 },
    ],
  };
}

function model(finalMargin = 12): DcfModel {
  return {
    forecastDrivers: Array.from({ length: 6 }, (_, index) => ({
      periodEnd: `${2026 + index}-12-31`, source: "Test", revenueGrowth: 5, grossMargin: 40, ebitMargin: finalMargin,
      taxRate: 21, daPercent: 3, capexPercent: 4, changeNwcPercent: 1, deferredTaxPercent: 0, otherNonCashPercent: 0,
    })),
    normalizedTaxRate: 21, riskFreeRate: 4, beta: 1, equityRiskPremium: 5, preTaxCostDebt: 6,
    companyRiskPremium: 0, terminalGrowth: 2.5, terminalRoic: 9, exitMultiple: 10, cash: 100,
    shortDebt: 0, longDebt: 100, preferredInterest: 0, shares: 100, marketPrice: 10, valuationDate: "2026-01-01",
  };
}

const baseValuation: RiskValuationResult = {
  valid: true,
  perShare: 14,
  terminalShare: 60,
  terminalForecastFcf: 100,
  terminalFcf: 100,
};

test("capital-intensive growth issuer receives the existing high-capex and turnaround warnings", () => {
  const data = company({ symbol: "GPUC", niche: "AI-native GPU cloud and data center", capex: 30, margin: -5, forecast: false });
  const risks = riskAnalysis(data, model(12), baseValuation, { ...baseValuation, perShare: 16 });
  assert.equal(risks.find((risk) => risk.title === "Capital intensity")?.level, "high");
  assert.equal(risks.find((risk) => risk.title === "Turnaround assumption")?.level, "high");
  assert.equal(risks.find((risk) => risk.title === "Geopolitical and cross-border exposure")?.level, "medium");
  assert.match(risks.find((risk) => risk.title === "Capital intensity")?.detail || "", /^30% of latest revenue/);
});

test("financial institution receives institution-specific risks instead of generic leverage framing", () => {
  const risks = financialSectorRiskAnalysis(company({ symbol: "BANK", niche: "Large diversified bank" }));
  assert.equal(risks[0].title, "Valuation-method limitation");
  assert.equal(risks[0].level, "high");
  assert.ok(risks.some((risk) => risk.title === "Capital adequacy"));
  assert.ok(risks.some((risk) => risk.title === "Credit quality and reserves"));
  assert.equal(risks.some((risk) => risk.title === "Balance-sheet leverage"), false);
});

test("ordinary issuer retains low capital, leverage, margin, and geopolitical classifications", () => {
  const risks = riskAnalysis(company(), model(), baseValuation, { ...baseValuation, perShare: 15 });
  assert.equal(risks.find((risk) => risk.title === "Capital intensity")?.level, "low");
  assert.equal(risks.find((risk) => risk.title === "Balance-sheet leverage")?.level, "low");
  assert.equal(risks.find((risk) => risk.title === "Operating-margin consistency")?.level, "low");
  assert.equal(risks.find((risk) => risk.title === "Geopolitical and cross-border exposure")?.level, "low");
});
