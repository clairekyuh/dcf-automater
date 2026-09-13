import assert from "node:assert/strict";
import test from "node:test";
import { createConcurrencyGate, createFixedWindowRateLimiter, requestClientKey } from "@/lib/server/request-limits";

test("fixed-window limiter resets after its window", () => {
  const check = createFixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });
  assert.equal(check("client", 0).allowed, true);
  assert.equal(check("client", 100).allowed, true);
  assert.equal(check("client", 200).allowed, false);
  assert.equal(check("client", 1_001).allowed, true);
});

test("concurrency gate releases capacity exactly once", () => {
  const gate = createConcurrencyGate(1);
  const release = gate.tryEnter();
  assert.ok(release);
  assert.equal(gate.tryEnter(), null);
  release();
  release();
  assert.equal(gate.activeCount(), 0);
  assert.ok(gate.tryEnter());
});

test("client key uses only the first bounded forwarded address", () => {
  const request = new Request("https://example.test", { headers: { "x-forwarded-for": `${"1".repeat(100)}, 10.0.0.2` } });
  assert.equal(requestClientKey(request).length, 80);
});
