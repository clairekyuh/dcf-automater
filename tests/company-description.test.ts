import assert from "node:assert/strict";
import test from "node:test";
import { conciseBusinessDescription } from "../lib/company-description";

test("known company summaries stay factual and omit mission language", () => {
  const cadence = conciseBusinessDescription({ symbol: "CDNS", name: "Cadence", description: "Our mission is to empower every person.", sector: "Technology", industry: "Prepackaged software" });
  assert.match(cadence, /electronic-design-automation software/i);
  assert.doesNotMatch(cadence, /mission|empower/i);
});

test("marketing-only provider copy falls back to an honest classification", () => {
  const result = conciseBusinessDescription({ name: "Example Corp", description: "We are the world's leading company with a mission to empower everyone.", sector: "Industrials", industry: "Manufacturing" });
  assert.match(result, /operates in Manufacturing/);
  assert.doesNotMatch(result, /mission|empower/i);
});
