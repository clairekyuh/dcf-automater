import assert from "node:assert/strict";
import test from "node:test";
import { latestTreasuryObservation } from "../lib/market-inputs";

test("reads the latest valid Treasury yield from FRED CSV", () => {
  const csv = "observation_date,DGS10\n2026-10-19,4.12\n2026-10-20,4.08\n2026-10-21,.";
  assert.deepEqual(latestTreasuryObservation(csv), { asOf: "2026-10-20", rate: 4.08 });
});

test("rejects HTML and implausible values instead of corrupting WACC", () => {
  const html = "<!doctype html>\n<link href=\"https://fonts.googleapis.com/css?family=Open+Sans:300,400\">";
  assert.equal(latestTreasuryObservation(html), null);
  assert.equal(latestTreasuryObservation("observation_date,DGS10\n2026-10-20,400"), null);
});
