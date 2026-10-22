import assert from "node:assert/strict";
import test from "node:test";
import { reconcileHistoricalCashFlow } from "../lib/cash-flow-reconciliation";

test("reconciliation bridges reported CFO cash flow and EBIT-derived FCFF without forcing equality", () => {
  const result = reconcileHistoricalCashFlow({
    period: "2026-01-31",
    revenue: 7_206,
    ebit: 1_578,
    taxRate: 19.95,
    depreciationAndAmortization: 195,
    capex: 76,
    operatingCashFlow: 2_452,
    interestExpense: 80,
    shareBasedCompensation: 788,
    contractCostAmortization: 536,
    contractCostAssetCurrent: 913,
    contractCostAssetPrior: 467,
    deferredTaxCashFlowAdjustment: -301,
  });
  assert.equal(result.reportedFreeCashFlow, 2_376);
  assert.equal(result.knownDrivers.contractCostAssetChange, 446);
  assert.equal(result.status, "review");
  assert.ok(result.residualCashConversion > 1_000);
  assert.match(result.explanation, /different|differs/i);
});

test("reported zero is preserved in cash-flow reconciliation", () => {
  const result = reconcileHistoricalCashFlow({ period: "2026-12-31", revenue: 100, ebit: 0, taxRate: 21, depreciationAndAmortization: 0, capex: 0, operatingCashFlow: 0 });
  assert.equal(result.reportedFreeCashFlow, 0);
  assert.equal(result.residualCashConversion, 0);
  assert.equal(result.status, "reconciled");
});
