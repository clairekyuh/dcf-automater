import assert from "node:assert/strict";
import test from "node:test";
import { createRequestDiagnostics, measureDiagnostic, safeErrorType, withDiagnosticHeaders } from "../lib/server/diagnostics";

test("diagnostics preserve safe request IDs and replace unsafe values", () => {
  const safe = createRequestDiagnostics(new Request("https://example.test", { headers: { "x-request-id": "request_12345678" } }), "/api/test");
  assert.equal(safe.requestId, "request_12345678");

  const unsafe = createRequestDiagnostics(new Request("https://example.test", { headers: { "x-request-id": "bad value" } }), "/api/test");
  assert.match(unsafe.requestId, /^[0-9a-f-]{36}$/);
});

test("diagnostic response headers expose correlation and timing without error details", () => {
  const diagnostics = createRequestDiagnostics(new Request("https://example.test"), "/api/test");
  const response = withDiagnosticHeaders(new Response("ok"), diagnostics);
  assert.equal(response.headers.get("x-request-id"), diagnostics.requestId);
  assert.match(response.headers.get("server-timing") || "", /^app;dur=\d+$/);
  assert.equal(safeErrorType(new TypeError("private detail")), "TypeError");
});

test("measured diagnostics preserve operation results", async () => {
  const diagnostics = createRequestDiagnostics(new Request("https://example.test"), "/api/test");
  const originalInfo = console.info;
  console.info = () => undefined;
  try {
    assert.equal(await measureDiagnostic(diagnostics, { event: "provider_test", provider: "internal" }, async () => 42), 42);
  } finally {
    console.info = originalInfo;
  }
});
