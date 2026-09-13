import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithTimeout, type FetchImplementation } from "../lib/server/fetch-with-timeout";

function response(status: number, headers?: HeadersInit) {
  return new Response(null, { status, headers });
}

test("returns the first successful response and preserves Next fetch options", async () => {
  let receivedInit: RequestInit | undefined;
  const fetchImpl: FetchImplementation = async (_input, init) => {
    receivedInit = init;
    return response(200);
  };

  const result = await fetchWithTimeout(
    "https://example.test/data",
    { headers: { Accept: "application/json" }, next: { revalidate: 60 } },
    { fetchImpl },
  );

  assert.equal(result.status, 200);
  assert.equal(receivedInit?.headers && new Headers(receivedInit.headers).get("accept"), "application/json");
  assert.equal(receivedInit?.next?.revalidate, 60);
  assert.ok(receivedInit?.signal instanceof AbortSignal);
});

test("does not retry client errors other than HTTP 429", async () => {
  let calls = 0;
  const fetchImpl: FetchImplementation = async () => {
    calls += 1;
    return response(404);
  };

  const result = await fetchWithTimeout("https://example.test/missing", {}, { fetchImpl });

  assert.equal(result.status, 404);
  assert.equal(calls, 1);
});

test("retries HTTP 5xx responses with bounded exponential backoff", async () => {
  const statuses = [500, 502, 200];
  const delays: number[] = [];
  const fetchImpl: FetchImplementation = async () => response(statuses.shift()!);

  const result = await fetchWithTimeout("https://example.test/flaky", {}, {
    fetchImpl,
    baseDelayMs: 100,
    random: () => 0,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(delays, [100, 200]);
});

test("honors Retry-After for HTTP 429 but caps excessive waits", async () => {
  const delays: number[] = [];
  let calls = 0;
  const fetchImpl: FetchImplementation = async () => {
    calls += 1;
    return calls === 1 ? response(429, { "Retry-After": "120" }) : response(200);
  };

  await fetchWithTimeout("https://example.test/rate-limited", {}, {
    fetchImpl,
    baseDelayMs: 100,
    maxRetryAfterMs: 1_500,
    random: () => 0,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });

  assert.deepEqual(delays, [1_500]);
});

test("does not retry transport or timeout errors", async () => {
  let calls = 0;
  const fetchImpl: FetchImplementation = async () => {
    calls += 1;
    throw new TypeError("network unavailable");
  };

  await assert.rejects(
    fetchWithTimeout("https://example.test/offline", {}, { fetchImpl }),
    /network unavailable/,
  );
  assert.equal(calls, 1);
});
