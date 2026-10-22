import assert from "node:assert/strict";
import test from "node:test";
import { observationMillions, resolveDepreciationAndAmortization, resolveSecFinancialConcepts, type SecFact, type SecTaxonomy } from "../lib/sec-financial-concepts";

const annual = (val: number, end = "2026-01-31", tagAccession = "0000769397-26-000015"): SecFact => ({
  start: "2025-02-01",
  end,
  val,
  form: "10-K",
  filed: "2026-03-03",
  fp: "FY",
  accn: tagAccession,
});

const instant = (val: number, end = "2026-01-31"): SecFact => ({
  end,
  val,
  form: "10-K",
  filed: "2026-03-03",
  fp: "FY",
  accn: "0000769397-26-000015",
});

function taxonomy(values: Record<string, SecFact[]>): SecTaxonomy {
  return Object.fromEntries(Object.entries(values).map(([tag, facts]) => [tag, { units: { USD: facts } }]));
}

test("Autodesk fiscal 2026 uses filed aggregate D&A instead of property depreciation", () => {
  const concepts = resolveSecFinancialConcepts(taxonomy({
    DepreciationAndAmortization: [annual(195_000_000)],
    Depreciation: [annual(43_000_000)],
    CapitalizedContractCostAmortization: [annual(536_000_000)],
    ShareBasedCompensation: [annual(788_000_000)],
    IncreaseDecreaseInDeferredIncomeTaxes: [annual(-301_000_000)],
    PaymentsToAcquirePropertyPlantAndEquipment: [annual(43_000_000)],
    PaymentsToAcquireIntangibleAssets: [annual(33_000_000)],
    CapitalizedContractCostNet: [instant(913_000_000)],
  }), "2026-01-31");

  assert.equal(observationMillions(concepts.depreciationAndAmortization), 195);
  assert.equal(observationMillions(concepts.propertyDepreciation), 43);
  assert.equal(observationMillions(concepts.contractCostAmortization), 536);
  assert.equal(observationMillions(concepts.totalCapex), 76);
  assert.deepEqual(concepts.depreciationAndAmortization.rawTags, ["DepreciationAndAmortization"]);
  assert.equal(concepts.depreciationAndAmortization.components.length, 1);
});

test("component fallback reconstructs D&A without combining an aggregate and its components", () => {
  const aggregate = resolveDepreciationAndAmortization(taxonomy({
    DepreciationDepletionAndAmortization: [annual(100)],
    Depreciation: [annual(40)],
    FiniteLivedIntangibleAssetsAmortizationExpense: [annual(60)],
  }), "2026-01-31");
  assert.equal(aggregate.aggregate.value, 100);
  assert.equal(aggregate.aggregate.method, "single-tag");
  assert.equal(aggregate.aggregate.components.length, 1);

  const components = resolveDepreciationAndAmortization(taxonomy({
    Depreciation: [annual(40)],
    FiniteLivedIntangibleAssetsAmortizationExpense: [annual(60)],
  }), "2026-01-31");
  assert.equal(components.aggregate.value, 100);
  assert.equal(components.aggregate.method, "component-sum");
  assert.deepEqual(components.aggregate.rawTags, ["Depreciation", "FiniteLivedIntangibleAssetsAmortizationExpense"]);
});

test("reported zero remains reported while missing concepts remain unavailable", () => {
  const concepts = resolveSecFinancialConcepts(taxonomy({ DepreciationAndAmortization: [annual(0)] }), "2026-01-31");
  assert.equal(concepts.depreciationAndAmortization.value, 0);
  assert.equal(concepts.depreciationAndAmortization.status, "reported");
  assert.equal(concepts.contractCostAmortization.value, null);
  assert.equal(concepts.contractCostAmortization.status, "not-reported");
});

test("quarterly and wrong-period facts are not mixed into annual concepts", () => {
  const quarterly = { ...annual(999), form: "10-Q", start: "2025-11-01" };
  const wrongDate = annual(888, "2025-01-31", "0000769397-25-000019");
  const concepts = resolveSecFinancialConcepts(taxonomy({ DepreciationAndAmortization: [quarterly, wrongDate] }), "2026-01-31");
  assert.equal(concepts.depreciationAndAmortization.value, null);
});
