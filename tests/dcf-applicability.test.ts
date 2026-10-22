import assert from "node:assert/strict";
import test from "node:test";
import { assessStandardDcfApplicability } from "../lib/dcf-applicability";

const base = {
  company: { sector: "Technology", industry: "Application software", description: "Subscription software." },
  metrics: { revenue: 1_000, ebitMargin: 20, cash: 100 },
};

test("persistent operating losses require a turnaround model instead of an automatic terminal value", () => {
  const result = assessStandardDcfApplicability({ ...base, historical: [{ ebitMargin: -30 }, { ebitMargin: -20 }, { ebitMargin: -10 }] });
  assert.equal(result.supported, false);
  if (!result.supported) assert.equal(result.code, "persistent-loss");
});

test("one annual period is insufficient for an automated normalized DCF", () => {
  const result = assessStandardDcfApplicability({ ...base, historical: [{ ebitMargin: 20 }] });
  assert.equal(result.supported, false);
  if (!result.supported) assert.equal(result.code, "insufficient-history");
});

test("unverified cross-currency statements block a per-share valuation", () => {
  const result = assessStandardDcfApplicability({
    ...base,
    historical: [{ ebitMargin: 18 }, { ebitMargin: 20 }],
    denomination: { issuerReportingCurrency: "JPY", financialDisplayCurrency: "USD", fxRate: null },
  });
  assert.equal(result.supported, false);
  if (!result.supported) assert.equal(result.code, "currency-unverified");
});

test("ordinary profitable companies remain supported", () => {
  assert.deepEqual(assessStandardDcfApplicability({ ...base, historical: [{ ebitMargin: 18 }, { ebitMargin: 20 }] }), { supported: true });
});

test("a loss-making company spending more than revenue on capex requires an explicit operating plan", () => {
  const result = assessStandardDcfApplicability({
    company: { sector: "Technology", industry: "Cloud infrastructure" },
    metrics: { revenue: 5_000, ebitMargin: -1, cash: 3_000, capexPercentRevenue: 180 },
    historical: [{ revenue: 2_000, ebitMargin: 10 }, { revenue: 5_000, ebitMargin: -1 }],
  });
  assert.equal(result.supported, false);
  if (!result.supported) assert.equal(result.code, "capital-intensive-turnaround");
});
