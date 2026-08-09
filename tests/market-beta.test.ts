import assert from "node:assert/strict";
import test from "node:test";
import { estimateMarketBeta } from "../lib/market-beta";

function series(returns: number[]) {
  let close = 100;
  return [{ date: "2021-01-31", close }, ...returns.map((value, index) => {
    close *= 1 + value;
    const date = new Date(Date.UTC(2021, index + 1, 28)).toISOString().slice(0, 10);
    return { date, close };
  })];
}

test("monthly regression beta discloses raw beta and adjusts it toward one", () => {
  const marketReturns = Array.from({ length: 48 }, (_, index) => ((index % 7) - 3) / 100);
  const stockReturns = marketReturns.map((value) => value * 2);
  const result = estimateMarketBeta(series(stockReturns), series(marketReturns));
  assert.ok(result);
  assert.ok(Math.abs(result.rawBeta - 2) < 1e-10);
  assert.ok(Math.abs(result.beta - 5 / 3) < 1e-10);
  assert.equal(result.observations, 48);
});

test("beta estimate requires at least two years of matched monthly returns", () => {
  const returns = Array.from({ length: 12 }, (_, index) => ((index % 5) - 2) / 100);
  assert.equal(estimateMarketBeta(series(returns), series(returns)), null);
});
