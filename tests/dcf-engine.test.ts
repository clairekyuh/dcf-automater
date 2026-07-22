import assert from "node:assert/strict";
import test from "node:test";
import { addYears, calculateDcf, calculateWacc, forecastTiming, isStandardDcfUnsupported, type DcfModel } from "../lib/dcf-engine";

function model(periodEnd = "2026-12-31"): DcfModel {
  return {
    forecastDrivers: Array.from({ length: 6 }, (_, index) => ({
      periodEnd: addYears(periodEnd, index),
      source: index < 2 ? "Consensus test fixture" : "Editable model estimate",
      revenueGrowth: [20, 15, 11, 8, 6, 5][index],
      grossMargin: 60,
      ebitMargin: [18, 20, 22, 23, 24, 24][index],
      taxRate: 21,
      daPercent: 5,
      capexPercent: 6,
      changeNwcPercent: 1,
      deferredTaxPercent: 0,
      otherNonCashPercent: 0,
    })),
    normalizedTaxRate: 21,
    riskFreeRate: 4.6,
    beta: 1,
    equityRiskPremium: 4.18,
    preTaxCostDebt: 6,
    companyRiskPremium: 0.5,
    terminalGrowth: 2.5,
    exitMultiple: 12,
    cash: 200,
    shortDebt: 25,
    longDebt: 175,
    preferredInterest: 0,
    shares: 100,
    marketPrice: 50,
    valuationDate: "2026-04-27",
  };
}

test("calendar-period convention preserves the April 27 partial-year weight", () => {
  const timing = forecastTiming(model());
  assert.ok(Math.abs(timing.firstYearWeight - 247 / 365) < 1e-10);
  assert.ok(Math.abs(timing.firstYearWeight + timing.lastYearWeight - 1) < 1e-12);
  assert.ok(Math.abs(timing.periods[5] - (5 - timing.lastYearWeight / 2)) < 1e-12);
});

test("fiscal timing uses Apple's September year-end instead of December", () => {
  const apple = model("2026-09-27");
  apple.valuationDate = "2026-07-21";
  const timing = forecastTiming(apple);
  assert.ok(timing.firstYearWeight > 0.17 && timing.firstYearWeight < 0.20);
});

test("terminal growth cannot change the exit-multiple result", () => {
  const data = { metrics: { revenue: 1_000 } };
  const base = model();
  const first = calculateDcf(data, base, "multiple");
  const changed = calculateDcf(data, { ...base, terminalGrowth: 3.5 }, "multiple");
  assert.equal(first.perShare, changed.perShare);
  assert.deepEqual(first.years, changed.years);
});

test("perpetuity result is invalid rather than displayed as zero when WACC is not above growth", () => {
  const data = { metrics: { revenue: 1_000 } };
  const base = model();
  const wacc = calculateWacc(base).selectedWacc;
  const result = calculateDcf(data, { ...base, terminalGrowth: wacc + 0.1 }, "perpetuity");
  assert.equal(result.valid, false);
  assert.match(result.invalidReason || "", /WACC must be greater/);
});

test("selected WACC reconciles to formula WACC plus the visible company premium", () => {
  const details = calculateWacc(model());
  assert.ok(Math.abs(details.selectedWacc - details.baseWacc - 0.5) < 1e-12);
});

test("standard unlevered DCF is blocked for banks and insurers", () => {
  assert.equal(isStandardDcfUnsupported({ sector: "Finance", industry: "National commercial banks" }), true);
  assert.equal(isStandardDcfUnsupported({ sector: "Finance", industry: "Property & casualty insurance" }), true);
  assert.equal(isStandardDcfUnsupported({ sector: "Energy", industry: "Integrated oil companies" }), false);
});
