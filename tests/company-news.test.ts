import assert from "node:assert/strict";
import test from "node:test";
import { selectRelevantNews, type NasdaqNewsRow } from "../lib/company-news";

const rows: NasdaqNewsRow[] = [
  {
    title: "IREN Expands AI Cloud Platform After New Contracts",
    description: "IREN expands capacity and is linked to CoreWeave as a comparable company.",
    created: "Jul 21, 2026",
    publisher: "Example",
    url: "/articles/iren",
    related_symbols: ["iren|stocks", "crwv|stocks"],
  },
  {
    title: "CoreWeave Signs Multi-Year Customer Contract and Expands Data Center Capacity",
    description: "CoreWeave plans new infrastructure investment.",
    created: "Jul 20, 2026",
    publisher: "Example",
    url: "/articles/coreweave-contract",
    related_symbols: ["crwv|stocks"],
  },
  {
    title: "Why CoreWeave Stock Keeps Falling",
    description: "CoreWeave shares fell during the week.",
    created: "Jul 19, 2026",
    publisher: "Example",
    url: "/articles/price-chatter",
    related_symbols: ["crwv|stocks"],
  },
  {
    title: "Should You Buy CoreWeave Stock Before the Next Investor Update?",
    description: "A market-opinion article about CRWV.",
    created: "Jul 21, 2026",
    publisher: "Example",
    url: "/articles/buy-opinion",
    related_symbols: ["crwv|stocks"],
  },
];

test("news screen keeps company-specific fundamental events and removes price chatter", () => {
  const result = selectRelevantNews(rows, "CRWV", "CoreWeave, Inc.");
  assert.equal(result.length, 1);
  assert.match(result[0].title, /Multi-Year Customer Contract/);
  assert.equal(result[0].category, "Customers & demand");
  assert.match(result[0].whyItMatters, /revenue visibility/i);
});

test("related-symbol tagging alone does not make a peer headline company news", () => {
  const result = selectRelevantNews([rows[0]], "CRWV", "CoreWeave, Inc.");
  assert.equal(result.length, 0);
});
