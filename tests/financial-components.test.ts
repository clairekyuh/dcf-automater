import assert from "node:assert/strict";
import test from "node:test";
import { fundedDebt, observationStale } from "../lib/financial-components";

test("Apple term debt and commercial paper reconcile without losing short-term funding", () => {
  const debt = fundedDebt({ currentTerm: 12_350, noncurrentTerm: 78_328, commercialPaper: 7_979 });
  assert.equal(debt.current, 20_329);
  assert.equal(debt.total, 98_657);
});
test("aggregate short-term borrowings already include commercial paper", () => {
  assert.equal(fundedDebt({ currentTerm: 10, noncurrentTerm: 80, shortBorrowings: 15, commercialPaper: 12 }).total, 105);
  assert.equal(fundedDebt({ totalTerm: 90, commercialPaper: 12 }).total, 102);
});
test("missing financial components remain unavailable; reported zero remains zero", () => {
  assert.equal(fundedDebt({}).total, null);
  assert.equal(fundedDebt({ currentTerm: 0, noncurrentTerm: 0, commercialPaper: 0 }).total, 0);
});
test("freshness follows observation time, not when a cached object was saved", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(observationStale("2026-10-15T11:30:00Z", now), false);
  assert.equal(observationStale("2026-10-14T12:00:00Z", now), true);
  assert.equal(observationStale(undefined, now), true);
});

test("total term debt derives current maturities before adding commercial paper", () => {
 const debt = fundedDebt({totalTerm:90, noncurrentTerm:80, commercialPaper:12});
 assert.equal(debt.current,22); assert.equal(debt.noncurrent,80); assert.equal(debt.total,102);
});
