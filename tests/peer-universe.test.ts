import assert from "node:assert/strict";
import test from "node:test";
import { selectPeerSet, type PeerCompanyInput } from "../lib/peer-universe";

function company(overrides: Partial<PeerCompanyInput>): PeerCompanyInput {
  return {
    symbol: "TEST",
    name: "Test Company",
    sector: "Unknown",
    industry: "Unknown",
    description: "No recognized business classification.",
    ...overrides,
  };
}

test("AAPL uses the exact consumer ecosystem universe", () => {
  const result = selectPeerSet(company({ symbol: "AAPL", name: "Apple Inc." }));

  assert.equal(result.id, "consumer-ecosystems");
  assert.equal(result.classificationConfidence, "high");
  assert.deepEqual(result.symbols, ["GOOGL", "MSFT", "SONY"]);
});

test("CRWV uses focused AI-cloud peers and keeps hyperscalers separate", () => {
  const result = selectPeerSet(company({ symbol: "CRWV", name: "CoreWeave" }));

  assert.equal(result.id, "ai-cloud");
  assert.equal(result.classificationConfidence, "high");
  assert.deepEqual(result.symbols, ["NBIS", "IREN", "APLD"]);
  assert.deepEqual(result.operatingCompetitors, ["MSFT", "AMZN", "GOOGL", "ORCL"]);
  assert.equal(result.rationales?.NBIS.fit, "direct");
});

test("WMT uses the exact large-format retail universe", () => {
  const result = selectPeerSet(company({ symbol: "WMT", name: "Walmart" }));

  assert.equal(result.id, "retail");
  assert.equal(result.classificationConfidence, "high");
  assert.deepEqual(result.symbols, ["COST", "TGT", "AMZN"]);
});

test("JPM uses the exact diversified-bank universe", () => {
  const result = selectPeerSet(company({ symbol: "JPM", name: "JPMorgan Chase" }));

  assert.equal(result.id, "banks");
  assert.equal(result.classificationConfidence, "high");
  assert.deepEqual(result.symbols, ["BAC", "WFC", "C"]);
});

test("unclassified companies do not receive an unrelated fallback universe", () => {
  const result = selectPeerSet(company({ industry: "Specialized services" }));

  assert.equal(result.id, "unclassified");
  assert.equal(result.classificationConfidence, "low");
  assert.deepEqual(result.symbols, []);
  assert.match(result.label, /peer set not validated/);
});
