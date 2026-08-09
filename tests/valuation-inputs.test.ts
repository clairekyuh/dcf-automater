import assert from "node:assert/strict";
import test from "node:test";
import { betaCoveragePremium, selectShareCount } from "../lib/valuation-inputs";

test("beta coverage premium only fills a disclosed insufficient-history gap", () => {
  assert.equal(betaCoveragePremium("Neutral 1.0 fallback because history is insufficient", 11, 8.2), 2.8);
  assert.equal(betaCoveragePremium("Adjusted five-year regression beta", 11, 8.2), 0);
  assert.equal(betaCoveragePremium("Neutral 1.0 fallback", 8, 9), 0);
});

test("US issuers can use SEC diluted shares while foreign quotes retain market-cap-consistent units", () => {
  const us = selectShareCount({ country: "United States", secDilutedShares: 90, marketCapShares: 100, secReportDate: "2025-12-31" });
  assert.equal(us.shares, 90);
  assert.match(us.source, /SEC weighted-average diluted shares/);

  const foreign = selectShareCount({ country: "China", secDilutedShares: 900, marketCapShares: 100, secReportDate: "2025-12-31" });
  assert.equal(foreign.shares, 100);
  assert.match(foreign.source, /ADR\/local-share conversion/);
});
