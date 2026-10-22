import assert from "node:assert/strict";
import test from "node:test";
import { signedMultiple, profitMultiple } from "../lib/comparable-metrics";

test("signed multiples retain negative, zero and extreme results", () => {
  assert.equal(signedMultiple(100, -5), -20);
  assert.equal(signedMultiple(-100, 5), -20);
  assert.equal(signedMultiple(0, 5), 0);
  assert.equal(signedMultiple(1_000, .001), 1_000_000);
  assert.deepEqual(profitMultiple(100, -5, 200), { value: -20, quality: "not-meaningful" });
  assert.deepEqual(profitMultiple(1_000, 1, 200), { value: 1_000, quality: "extreme" });
  assert.equal(profitMultiple(100, 5, null).value, 20);
});
test("missing inputs and zero denominators stay undefined instead of becoming zero", () => {
  for (const denominator of [null, 0, NaN, Infinity]) assert.equal(signedMultiple(100, denominator), null);
  assert.equal(signedMultiple(null, 5), null);
});

test("exit benchmark uses the median of every finite reported peer multiple", async () => {
  const { peerExitBenchmark } = await import("../lib/comparable-metrics");
  const benchmark = peerExitBenchmark([
    { evToEbitdaLtm: -30, evToEbitdaLtmQuality: "not-meaningful" },
    { evToEbitdaLtm: 18, evToEbitdaLtmQuality: "normal", peerFit: "direct" },
    { evToEbitdaLtm: 20, evToEbitdaLtmQuality: "normal", peerFit: "close" },
    { evToEbitdaLtm: 24, evToEbitdaLtmQuality: "normal", peerFit: "direct" },
    { evToEbitdaLtm: 1_000, evToEbitdaLtmQuality: "extreme" },
  ]);
  assert.deepEqual(benchmark.values, [-30, 18, 20, 24, 1_000]);
  assert.deepEqual(benchmark.eligibleValues, [-30, 18, 20, 24, 1_000]);
  assert.equal(benchmark.selected, 20);
  assert.equal(benchmark.sufficient, true);
});

test("automatic exit benchmark retains one, dispersed, adjacent, negative, and extreme observations", async () => {
  const { peerExitBenchmark } = await import("../lib/comparable-metrics");
  const limited = peerExitBenchmark([{ evToEbitdaLtm: 17 }, { evToEbitdaLtm: 35 }]);
  assert.equal(limited.selected, 26);
  assert.match(limited.reason, /midpoint/i);

  const thin = peerExitBenchmark([{ evToEbitdaLtm: 17 }]);
  assert.equal(thin.selected, 17);
  assert.match(thin.reason, /only numerical peer/i);

  const dispersed = peerExitBenchmark([{ evToEbitdaLtm: 10 }, { evToEbitdaLtm: 20 }, { evToEbitdaLtm: 40 }]);
  assert.equal(dispersed.selected, 20);

  const adjacent = peerExitBenchmark([{ evToEbitdaLtm: 15, peerFit: "adjacent" }, { evToEbitdaLtm: 18 }, { evToEbitdaLtm: 20 }]);
  assert.equal(adjacent.eligibleCount, 3);
  assert.equal(adjacent.selected, 18);

  const nonPositiveMedian = peerExitBenchmark([{ evToEbitdaLtm: -20 }, { evToEbitdaLtm: -10 }, { evToEbitdaLtm: 5 }]);
  assert.deepEqual(nonPositiveMedian.values, [-20, -10, 5]);
  assert.equal(nonPositiveMedian.median, -10);
  assert.equal(nonPositiveMedian.selected, null);
  assert.match(nonPositiveMedian.reason, /cannot be applied as a positive/i);
});
