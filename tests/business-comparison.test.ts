import assert from "node:assert/strict";
import test from "node:test";
import { buildBusinessComparison, buildPeerSimilarityRationale, type BusinessComparable } from "../lib/business-comparison";

const company = (symbol: string, description: string): BusinessComparable => ({
  symbol,
  name: symbol,
  description,
  sector: "Technology",
  industry: "Technology",
});

test("Apple comparison explains its business model and each major peer model", () => {
  const result = buildBusinessComparison({
    company: company("AAPL", "Apple sells devices and services."),
    peers: [company("GOOGL", "Advertising platform."), company("MSFT", "Enterprise software."), company("SONY", "Gaming and media.")],
    nicheLabel: "Consumer devices and digital ecosystems",
    capexPercentRevenue: 3.1,
    operatingMargin: 31,
    peerMedianMargin: 28,
  });
  assert.match(result.title, /premium hardware/i);
  assert.match(result.summary, /advertising-funded/i);
  assert.match(result.summary, /enterprise-software/i);
  assert.match(result.peerModels.find((peer) => peer.symbol === "SONY")?.detail || "", /gaming.*content.*image sensors/i);
  assert.match(result.dimensions[1].detail, /supplier commitments/i);
});

test("every company receives niche-specific comparison dimensions rather than a vague disclaimer", () => {
  const result = buildBusinessComparison({
    company: company("CRWV", "CRWV rents GPU computing capacity and provides managed software for AI workloads."),
    peers: [company("NBIS", "NBIS operates an AI cloud platform."), company("APLD", "APLD develops data centers for AI customers.")],
    nicheLabel: "AI-native GPU cloud infrastructure",
    capexPercentRevenue: 54,
    operatingMargin: -12,
    peerMedianMargin: 4,
  });
  assert.match(result.summary, /rents GPU computing capacity/i);
  assert.match(result.dimensions[0].detail, /customer concentration/i);
  assert.match(result.dimensions[1].detail, /GPU refresh cycles/i);
  assert.match(result.dimensions[2].detail, /-12% versus a 4% peer median/i);
});

test("Apple peer rationale says what Alphabet does and why it is similar", () => {
  const result = buildPeerSimilarityRationale({
    targetSymbol: "AAPL",
    nicheLabel: "Consumer devices and digital ecosystems",
    peer: company("GOOGL", "Alphabet operates advertising and cloud platforms."),
  });
  assert.match(result, /advertising-funded/i);
  assert.match(result, /similar to AAPL/i);
  assert.match(result, /both control large consumer platforms/i);
  assert.match(result, /unlike Apple/i);
  assert.doesNotMatch(result, /selected from.*peer universe/i);
});

test("generic peer rationale combines the peer business with a niche-specific similarity", () => {
  const result = buildPeerSimilarityRationale({
    targetSymbol: "CRWV",
    nicheLabel: "AI-native GPU cloud infrastructure",
    peer: company("NBIS", "Nebius operates an AI cloud platform with GPU computing and managed services."),
  });
  assert.match(result, /Nebius operates an AI cloud platform/i);
  assert.match(result, /Similarity to CRWV/i);
  assert.match(result, /Both serve AI computing demand/i);
  assert.match(result, /data-center ownership/i);
});
