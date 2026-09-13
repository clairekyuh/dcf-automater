import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorMessage } from "@/lib/client/api-error";

test("API errors include only validated diagnostic references", () => {
  assert.equal(
    apiErrorMessage({ error: "Unable to load.", code: "COMPANY_DATA_UNAVAILABLE", requestId: "request_12345678" }, "Fallback"),
    "Unable to load. Reference: COMPANY_DATA_UNAVAILABLE · request_12345678.",
  );
  assert.equal(apiErrorMessage({ error: "", requestId: "unsafe value" }, "Fallback"), "Fallback");
});
