import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import fs from "node:fs/promises";
import { POST } from "@/app/api/export-dcf/route";

function payload() {
  return {
    company: { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", industry: "Consumer electronics" },
    source: "Test data", asOf: "2026-09-30", sharesSource: "Test shares",
    metrics: { revenue: 400_000 },
    market: { priceHistory: [{ date: "2026-09-17", close: 200 }, { date: "2025-09-17", close: 180 }] },
    historical: [],
    comparison: { nicheLabel: "Consumer devices", peers: [
      { symbol: "MSFT", name: "Microsoft", evToEbitda: 25, revenueGrowth: 12, operatingMargin: 40, evToRevenue: 10, marketCap: 3_000_000 },
    ] },
    model: {
      valuationDate: "2026-09-17", marketPrice: 200, shares: 15_000, cash: 50_000,
      shortDebt: 10_000, longDebt: 80_000, preferredInterest: 0, beta: 1.1,
      riskFreeRate: 4.2, equityRiskPremium: 4.5, preTaxCostDebt: 4, normalizedTaxRate: 18,
      companyRiskPremium: 0, terminalGrowth: 3, terminalRoic: 9, exitMultiple: 15,
      forecastDrivers: Array.from({ length: 6 }, (_, index) => ({
        periodEnd: `${2027 + index}-09-30`, revenueGrowth: 5, grossMargin: 45,
        ebitMargin: 25, taxRate: 18, daPercent: 3, capexPercent: 4,
        changeNwcPercent: 2, deferredTaxPercent: 0, otherNonCashPercent: 0,
        source: "Automatic model estimate",
      })),
    },
  };
}

test("Excel export contains native charts linked to workbook cells", async () => {
  const request = new Request("https://example.test/api/export-dcf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload()),
  });
  const response = await POST(request);
  assert.equal(response.status, 200);
  const bytes = await response.arrayBuffer();
  if (process.env.SAVE_CHART_TEST) await fs.writeFile(process.env.SAVE_CHART_TEST, Buffer.from(bytes));
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("xl/drawings/drawing1.xml"));
  for (let index = 1; index <= 6; index += 1) assert.ok(zip.file(`xl/charts/chart${index}.xml`));
  const operatingChart = await zip.file("xl/charts/chart2.xml")!.async("string");
  assert.match(operatingChart, /'Visual Summary'!\$C\$16:\$H\$16/);
  assert.match(operatingChart, /'Visual Summary'!\$C\$18:\$H\$18/);
  const rangeChart = await zip.file("xl/charts/chart1.xml")!.async("string");
  assert.match(rangeChart, /'Visual Summary'!\$C\$6:\$C\$10/);
  assert.match(rangeChart, /'Visual Summary'!\$D\$6:\$D\$10/);
  const peerChart = await zip.file("xl/charts/chart6.xml")!.async("string");
  assert.match(peerChart, /'Visual Summary'!\$B\$41:\$B\$41/);
  assert.match(peerChart, /'Visual Summary'!\$D\$41:\$D\$41/);
});
