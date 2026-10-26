import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import { POST } from "@/app/api/export-dcf/route";

function payload() {
  return {
    company: { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", sector: "Technology", industry: "Consumer electronics", description: "Consumer devices and services." },
    source: "Test data", asOf: "2026-09-30", sharesSource: "Test shares",
    metrics: { revenue: 400_000, ebitMargin: 31, cash: 60_000 },
    market: { priceHistory: [{ date: "2026-09-17", close: 200 }, { date: "2025-09-17", close: 180 }] },
    historical: [],
    comparison: { nicheLabel: "Consumer devices", peers: [
      { symbol: "MSFT", name: "Microsoft", evToEbitda: 25, revenueGrowth: 12, operatingMargin: 40, evToRevenue: 10, marketCap: 3_000_000 },
    ] },
    model: {
      valuationDate: "2026-10-15", marketPrice: 200, shares: 15_000, cash: 50_000,
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

test("chart insertion preserves cell-note relationships and valid drawing order", async () => {
  const response = await POST(new Request("https://example.test/api/export-dcf", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()),
  }));
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const sheet = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
  const rels = await zip.file("xl/worksheets/_rels/sheet2.xml.rels")!.async("string");
  assert.match(rels, /relationships\/comments"/);
  assert.match(rels, /relationships\/vmlDrawing"/);
  assert.match(rels, /relationships\/drawing"/);
  const ids = [...rels.matchAll(/\bId="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of sheet.matchAll(/r:id="([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Unresolved worksheet relationship ${match[1]}`);
  assert.ok(sheet.indexOf("<drawing ") < sheet.indexOf("<legacyDrawing "));
  const drawing = await zip.file("xl/drawings/drawing1.xml")!.async("string");
  assert.doesNotMatch(drawing, /<xdr:xfrm\s*\/>/);
  assert.equal((drawing.match(/<a:off x="0" y="0"\/>/g) || []).length, 6);
  assert.equal((drawing.match(/<a:ext cx="0" cy="0"\/>/g) || []).length, 6);
});


test("Excel scenario formulas rediscount explicit cash flows at each row WACC", async () => {
  const response = await POST(new Request("https://example.test/api/export-dcf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) }));
  assert.equal(response.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const output = workbook.getWorksheet("DCF Output")!;
  const cached = (sheet: string, address: string) => {
    const cell = workbook.getWorksheet(sheet)!.getCell(address.replaceAll("$", ""));
    if (typeof cell.value === "number") return cell.value;
    if (cell.value && typeof cell.value === "object" && ("formula" in cell.value || "sharedFormula" in cell.value)) return Number((cell.value as ExcelJS.CellFormulaValue).result ?? 0);
    throw new Error(`Non-numeric test reference ${sheet}!${address}`);
  };
  for (const row of [24, 25, 26]) for (const col of [5, 6, 7, 8, 9, 12, 13, 14, 15, 16]) {
    const value = output.getCell(row, col).value as ExcelJS.CellFormulaValue;
    let formula = value.formula.replace(/'([^']+)'!([A-Z$]+[0-9$]+)/g, (_, sheet, address) => String(cached(sheet, address)));
    formula = formula.replace(/\$?[A-Z]+\$?\d+/g, (address) => String(cached("DCF Output", address)));
    formula = formula.replace(/\^/g, "**").replace(/MAX\(/g, "Math.max(").replace(/SUM\(/g, "sum(");
    assert.match(formula, /^[0-9eE+*/().,\s\-a-zA-Z]*$/);
    const result = Function("sum", `return (${formula});`)((...values: number[]) => values.reduce((sum, number) => sum + number, 0)) as number;
    assert.ok(Math.abs(result - Number(value.result)) < 1e-8, `${output.getCell(row, col).address}: formula ${result}, web ${value.result}`);
  }
});

test("Excel leaves empty comps columns blank and retains raw exit formulas as requested", async () => {
  const requestPayload = payload();
  requestPayload.model.exitMultiple = -30;
  const response = await POST(new Request("https://example.test/api/export-dcf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestPayload) }));
  assert.equal(response.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const comps = workbook.getWorksheet("Comps")!;
  assert.match(comps.getCell("H6").formula, /IF\(COUNT/);
  assert.equal(comps.getCell("H6").result, undefined);
  assert.equal(comps.getCell("H7").result, undefined);
  assert.equal(workbook.getWorksheet("DCF Output")!.getCell("I8").formula, "I6*I7");
  assert.equal(workbook.getWorksheet("Inputs")!.getCell("C25").value, -30);
});

test("missing historical source fields are blank rather than reported zeros in Excel", async () => {
  const input = { ...payload(), historical: [{ year: "2025", fiscalDate: "2025-09-30", revenue: 400000, ebit: 0, ebitMargin: 0, depreciation: 0, capex: 0, operatingCashFlow: 0, missingFields: ["ebit", "ebitMargin", "depreciation", "capex", "operatingCashFlow"] }] };
  const response = await POST(new Request("https://example.test/api/export-dcf", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)}));
  assert.equal(response.status,200);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await response.arrayBuffer());
  const sheet=workbook.getWorksheet("DCF Build")!;
  for (const row of [10,11,12,13,14,15,19,24]) assert.equal(sheet.getCell(`F${row}`).value,null,`F${row}`);
  assert.equal(sheet.getCell("F6").value,400000);
});
