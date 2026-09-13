import assert from "node:assert/strict";
import test from "node:test";
import { defaultRiskScreen, type CorporateCreditScreenInput } from "../lib/credit-screen";

const healthy: CorporateCreditScreenInput = {
  debtToRevenue: 0.4,
  netDebtToEbitda: 1.5,
  currentRatio: 2,
  interestCoverage: 8,
  fcfToDebt: 0.25,
  ebitda: 500,
  freeCashFlow: 100,
};

test("labels a fully populated healthy corporate screen low risk", () => {
  const result = defaultRiskScreen(healthy);

  assert.equal(result.level, "low");
  assert.equal(result.points, 0);
  assert.equal(result.availableChecks, 5);
  assert.deepEqual(result.drivers, ["The available leverage, liquidity, coverage, and cash-flow ratios do not show an obvious near-term default warning."]);
});

test("preserves high-risk thresholds and explanatory drivers", () => {
  const result = defaultRiskScreen({
    debtToRevenue: 1.6,
    netDebtToEbitda: 4.1,
    currentRatio: 0.9,
    interestCoverage: 1.4,
    fcfToDebt: -0.1,
    ebitda: -1,
    freeCashFlow: -10,
  });

  assert.equal(result.level, "high");
  assert.equal(result.points, 12);
  assert.equal(result.availableChecks, 5);
  assert.deepEqual(result.drivers, [
    "Debt is high relative to revenue.",
    "Net debt exceeds four times EBITDA.",
    "Current liabilities exceed current assets.",
    "Operating income provides weak interest coverage.",
    "Free cash flow is negative relative to debt.",
    "EBITDA is non-positive, weakening debt-service capacity.",
  ]);
});

test("does not claim low risk when fewer than three core ratios exist", () => {
  const result = defaultRiskScreen({
    ...healthy,
    debtToRevenue: 2,
    netDebtToEbitda: null,
    currentRatio: null,
    interestCoverage: null,
    fcfToDebt: 0.05,
  });

  assert.equal(result.level, "insufficient");
  assert.equal(result.points, 3);
  assert.equal(result.availableChecks, 2);
  assert.deepEqual(result.drivers, ["Fewer than three core solvency ratios could be calculated from the latest SEC annual facts, so the model will not label the company low risk."]);
});
