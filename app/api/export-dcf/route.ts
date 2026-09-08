import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { calculateDcf, calculateWacc, type DcfModel } from "@/lib/dcf-engine";
import { historicalEffectiveTaxRate, historicalRevenueGrowth, historicalUfcf } from "@/lib/historical-dcf";

export const runtime = "nodejs";
export const maxDuration = 60;

type ExportHistorical = {
  year: string;
  fiscalDate?: string;
  revenue: number;
  ebit: number;
  ebitMargin: number;
  operatingCashFlow: number;
  depreciation: number;
  capex: number;
  cogs?: number;
  interestExpense?: number;
  incomeTax?: number;
  earningsBeforeTax?: number;
};

type ExportPeer = {
  symbol: string;
  name: string;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  evToRevenue: number | null;
  evToEbitda: number | null;
  pe: number | null;
  peerFit?: string;
  peerRationale?: string;
};

type ExportPayload = {
  company: { symbol: string; name: string; exchange: string; industry: string };
  source: string;
  asOf: string;
  sharesSource?: string;
  metrics: { revenue: number };
  historical: ExportHistorical[];
  model: DcfModel;
  comparison?: { nicheLabel?: string; peers?: ExportPeer[] };
};

const navy = "17324D";
const blue = "0000FF";
const teal = "20B7C9";
const paleBlue = "E8F2F7";
const paleGreen = "EEF5E6";
const gray = "66727A";
const lightBorder = "C8D1D6";
const white = "FFFFFF";
const black = "000000";
const moneyFormat = "$#,##0;[Red]($#,##0);-";
const perShareFormat = "$0.00;[Red]($0.00);-";
const percentFormat = "0.0%;[Red](0.0%);-";
const multipleFormat = "0.0x;[Red](0.0x);-";

function asDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formulaCell(formula: string, result: number | string) {
  return { formula, result } as ExcelJS.CellFormulaValue;
}

function setTitle(sheet: ExcelJS.Worksheet, range: string, title: string, subtitle?: string) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = title;
  cell.font = { name: "Aptos Display", size: 18, bold: true, color: { argb: white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  cell.alignment = { vertical: "middle" };
  if (subtitle) cell.note = subtitle;
}

function styleSection(row: ExcelJS.Row, from = 2, to = 12) {
  row.height = 21;
  for (let column = from; column <= to; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: white } };
    cell.border = { bottom: { style: "thin", color: { argb: navy } } };
  }
}

function styleInput(cell: ExcelJS.Cell, note?: string) {
  cell.font = { name: "Aptos", size: 10, color: { argb: blue } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE6" } };
  if (note) cell.note = note;
}

function styleFormula(cell: ExcelJS.Cell, linked = false) {
  cell.font = { name: "Aptos", size: 10, color: { argb: linked ? "008000" : black } };
}

function styleTableHeader(row: ExcelJS.Row, from: number, to: number) {
  row.height = 24;
  for (let column = from; column <= to; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: white } };
    cell.alignment = { vertical: "middle", horizontal: column === from ? "left" : "right", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: white } } };
  }
}

function applyBodyStyle(sheet: ExcelJS.Worksheet, range: string) {
  const [from, to] = range.split(":");
  const start = sheet.getCell(from);
  const end = sheet.getCell(to);
  for (let row = start.row; row <= end.row; row += 1) {
    for (let column = start.col; column <= end.col; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.font = cell.font?.name ? cell.font : { name: "Aptos", size: 10, color: { argb: black } };
      cell.border = { bottom: { style: "hair", color: { argb: lightBorder } } };
      cell.alignment = { vertical: "middle", horizontal: column === start.col ? "left" : "right" };
    }
  }
}

function safeResult(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ExportPayload;
    if (!payload?.company?.symbol || !payload?.model || !Array.isArray(payload.model.forecastDrivers)) {
      return NextResponse.json({ error: "A loaded company and complete model are required." }, { status: 400 });
    }
    if (payload.model.forecastDrivers.length !== 6) {
      return NextResponse.json({ error: "The Excel model requires exactly six forecast periods." }, { status: 400 });
    }

    const perpetuity = calculateDcf(payload, payload.model, "perpetuity");
    const multiple = calculateDcf(payload, payload.model, "multiple");
    const wacc = calculateWacc(payload.model);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DCF Valuation Studio";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;

    const cover = workbook.addWorksheet("Cover", { views: [{ showGridLines: false }] });
    const inputs = workbook.addWorksheet("Inputs", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
    const build = workbook.addWorksheet("DCF Build", { views: [{ state: "frozen", xSplit: 1, ySplit: 5, showGridLines: false }] });
    const output = workbook.addWorksheet("DCF Output", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
    const comps = workbook.addWorksheet("Comps", { views: [{ state: "frozen", ySplit: 5, showGridLines: false }] });
    const checks = workbook.addWorksheet("Sources & Checks", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });

    cover.columns = [{ width: 4 }, { width: 31 }, { width: 74 }];
    setTitle(cover, "B2:C3", `${payload.company.name} — DCF Model`, "Formula-driven export from the active website assumptions.");
    cover.getCell("B5").value = "Workbook flow";
    cover.getCell("B5").font = { bold: true, color: { argb: navy } };
    const coverRows = [
      ["Inputs", "Blue cells are editable assumptions and forecast drivers."],
      ["DCF Build", "Historical reference data followed by six formula-driven forecast periods and UFCF."],
      ["DCF Output", "Perpetual-growth and exit-multiple valuations with live sensitivities."],
      ["Comps", "Operating peers and current valuation ratios returned by the website."],
      ["Sources & Checks", "Input provenance and model-integrity checks."],
    ];
    coverRows.forEach(([name, description], index) => {
      cover.getCell(7 + index, 2).value = name;
      cover.getCell(7 + index, 2).font = { bold: true, color: { argb: navy } };
      cover.getCell(7 + index, 3).value = description;
    });
    cover.getCell("B14").value = "Model convention";
    cover.getCell("B14").font = { bold: true, color: { argb: navy } };
    cover.getCell("C14").value = "USD millions except per-share values. Five-year exact valuation window using partial-year weights and mid-year discounting. Scenario outputs are not analyst price targets.";
    cover.getCell("C14").alignment = { wrapText: true };

    inputs.columns = [
      { width: 3 }, { width: 37 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
      { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 },
    ];
    setTitle(inputs, "B2:K2", `${payload.company.name} — Inputs`, "Editable assumptions are blue with a pale-yellow fill.");
    inputs.getCell("B4").value = "Company"; inputs.getCell("C4").value = payload.company.name;
    inputs.getCell("B5").value = "Ticker"; inputs.getCell("C5").value = payload.company.symbol;
    inputs.getCell("B6").value = "Financials through"; inputs.getCell("C6").value = payload.asOf;
    inputs.getCell("B7").value = "Valuation date"; inputs.getCell("C7").value = asDate(payload.model.valuationDate); inputs.getCell("C7").numFmt = "yyyy-mm-dd"; styleInput(inputs.getCell("C7"), "Sets the exact five-year valuation window and partial-year weighting.");
    inputs.getCell("B8").value = "Units"; inputs.getCell("C8").value = "USD millions except per-share data";
    inputs.getCell("B9").value = "Starting revenue"; inputs.getCell("C9").value = payload.metrics.revenue; inputs.getCell("C9").numFmt = moneyFormat; inputs.getCell("C9").note = `${payload.source}; financials through ${payload.asOf}.`;
    inputs.getCell("B10").value = "Capital, WACC & terminal assumptions"; styleSection(inputs.getRow(10), 2, 3);
    const scalarInputs: Array<[number, string, number, string, string]> = [
      [11, "Market price", payload.model.marketPrice, perShareFormat, "Used only for upside/downside and market-value capital weights."],
      [12, "Diluted shares (mm)", payload.model.shares, "#,##0.0", payload.sharesSource || "Verify against a current fully diluted share count."],
      [13, "Cash & included investments", payload.model.cash, moneyFormat, "Non-operating cash added in the enterprise-to-equity bridge."],
      [14, "Short-term debt", payload.model.shortDebt, moneyFormat, "Current funded debt subtracted from enterprise value."],
      [15, "Long-term debt", payload.model.longDebt, moneyFormat, "Non-current funded debt subtracted from enterprise value."],
      [16, "Preferred stock & minority interests", payload.model.preferredInterest, moneyFormat, "Other non-common-equity claims."],
      [17, "Risk-free rate", payload.model.riskFreeRate / 100, percentFormat, "Long-term government bond proxy for the valuation currency."],
      [18, "Beta", payload.model.beta, "0.00x", "Equity beta used in CAPM."],
      [19, "Equity risk premium", payload.model.equityRiskPremium / 100, percentFormat, "Expected equity-market return above the risk-free rate."],
      [20, "Pre-tax cost of debt", payload.model.preTaxCostDebt / 100, percentFormat, "Forward borrowing cost or disclosed proxy."],
      [21, "Normalized tax rate", payload.model.normalizedTaxRate / 100, percentFormat, "Used for the interest tax shield in WACC."],
      [22, "Company-specific premium", payload.model.companyRiskPremium / 100, percentFormat, "Optional disclosed overlay; avoid double-counting forecast risks."],
      [23, "Perpetual growth rate", payload.model.terminalGrowth / 100, percentFormat, "Must remain below WACC and be sustainable in perpetuity."],
      [24, "Terminal ROIC", payload.model.terminalRoic / 100, percentFormat, "Determines required terminal reinvestment: g / ROIC."],
      [25, "Exit EBITDA multiple", payload.model.exitMultiple, multipleFormat, "Applied to EBITDA at the point exactly five years after valuation."],
    ];
    scalarInputs.forEach(([row, label, value, format, note]) => {
      inputs.getCell(row, 2).value = label;
      inputs.getCell(row, 3).value = value;
      inputs.getCell(row, 3).numFmt = format;
      styleInput(inputs.getCell(row, 3), note);
    });
    inputs.getCell("B27").value = "Market value of equity"; inputs.getCell("C27").value = formulaCell("C11*C12", wacc.equity); inputs.getCell("C27").numFmt = moneyFormat;
    inputs.getCell("B28").value = "Funded debt"; inputs.getCell("C28").value = formulaCell("C14+C15", wacc.debt); inputs.getCell("C28").numFmt = moneyFormat;
    inputs.getCell("B29").value = "Cost of equity"; inputs.getCell("C29").value = formulaCell("C17+C18*C19", wacc.costEquity / 100); inputs.getCell("C29").numFmt = percentFormat;
    inputs.getCell("B30").value = "After-tax cost of debt"; inputs.getCell("C30").value = formulaCell("C20*(1-C21)", wacc.afterTaxCostDebt / 100); inputs.getCell("C30").numFmt = percentFormat;
    inputs.getCell("B31").value = "Base WACC"; inputs.getCell("C31").value = formulaCell("(C27/(C27+C28))*C29+(C28/(C27+C28))*C30", wacc.baseWacc / 100); inputs.getCell("C31").numFmt = percentFormat;
    inputs.getCell("B32").value = "Selected WACC"; inputs.getCell("C32").value = formulaCell("C31+C22", wacc.selectedWacc / 100); inputs.getCell("C32").numFmt = percentFormat; inputs.getCell("C32").font = { bold: true, color: { argb: black } };
    inputs.getCell("B34").value = "Forecast drivers"; styleSection(inputs.getRow(34), 2, 11);
    inputs.getRow(35).values = [null, "Fiscal period end", "Revenue growth", "Gross margin", "EBIT margin", "Tax rate", "D&A / revenue", "Capex / revenue", "ΔNWC / revenue", "Deferred tax / revenue", "Other non-cash / revenue"];
    styleTableHeader(inputs.getRow(35), 2, 11);
    payload.model.forecastDrivers.forEach((driver, index) => {
      const row = 36 + index;
      inputs.getCell(row, 2).value = asDate(driver.periodEnd);
      inputs.getCell(row, 2).numFmt = "yyyy-mm-dd";
      const values = [driver.revenueGrowth, driver.grossMargin, driver.ebitMargin, driver.taxRate, driver.daPercent, driver.capexPercent, driver.changeNwcPercent, driver.deferredTaxPercent, driver.otherNonCashPercent];
      values.forEach((value, valueIndex) => {
        const cell = inputs.getCell(row, 3 + valueIndex);
        cell.value = value / 100;
        cell.numFmt = percentFormat;
        styleInput(cell, `${driver.source}. Editable forecast driver for ${driver.periodEnd}.`);
      });
    });
    applyBodyStyle(inputs, "B4:C32");

    build.columns = [{ width: 35 }, ...Array.from({ length: 12 }, () => ({ width: 15 }))];
    setTitle(build, "A1:M2", `${payload.company.name} — DCF Build`, "Historical actuals are reference data; forecast columns are formulas linked to the Inputs sheet.");
    build.getCell("A4").value = "Period type";
    const historical = payload.historical.slice(-5);
    const historyOffset = 5 - historical.length;
    const historyColumns = ["B", "C", "D", "E", "F"];
    historyColumns.forEach((column, index) => {
      const row = historical[index - historyOffset];
      build.getCell(`${column}4`).value = row ? "Historical actual" : null;
      build.getCell(`${column}5`).value = row ? (row.fiscalDate ? asDate(row.fiscalDate) : row.year) : null;
      if (row?.fiscalDate) build.getCell(`${column}5`).numFmt = "yyyy\"A\"";
    });
    const forecastColumns = ["G", "H", "I", "J", "K", "L"];
    forecastColumns.forEach((column, index) => {
      build.getCell(`${column}4`).value = "Forecast estimate";
      build.getCell(`${column}5`).value = formulaCell(`'Inputs'!B${36 + index}`, payload.model.forecastDrivers[index].periodEnd);
      build.getCell(`${column}5`).numFmt = "yyyy\"E\"";
      styleFormula(build.getCell(`${column}5`), true);
    });
    build.getCell("M4").value = "Terminal"; build.getCell("M5").value = "At Year 5";
    const buildLabels: Array<[number, string]> = [
      [6, "Revenue"], [7, "% YoY growth"], [8, "Gross profit"], [9, "Gross margin"], [10, "EBIT"], [11, "EBIT margin"],
      [12, "Less: cash tax on EBIT"], [13, "NOPAT"], [14, "Plus: D&A"], [15, "Less: capex"], [16, "Less: change in NWC"],
      [17, "Plus: deferred tax change"], [18, "Plus: other non-cash adjustments"], [19, "Unlevered free cash flow"],
      [20, "Included portion of fiscal year"], [21, "Mid-year discount period"], [22, "Discount factor"], [23, "Present value of UFCF"], [24, "EBITDA"],
    ];
    buildLabels.forEach(([row, label]) => { build.getCell(row, 1).value = label; });
    historical.forEach((row, index) => {
      const column = historyColumns[index + historyOffset];
      const fullIndex = payload.historical.length - historical.length + index;
      const taxRate = historicalEffectiveTaxRate(row);
      const actuals: Record<number, number | null> = {
        6: row.revenue,
        7: historicalRevenueGrowth(payload.historical, fullIndex) === null ? null : historicalRevenueGrowth(payload.historical, fullIndex)! / 100,
        8: row.cogs === undefined ? null : row.revenue - row.cogs,
        9: row.cogs === undefined || !row.revenue ? null : (row.revenue - row.cogs) / row.revenue,
        10: row.ebit,
        11: row.ebitMargin / 100,
        12: taxRate === null ? null : Math.max(0, row.ebit * taxRate / 100),
        13: taxRate === null ? null : row.ebit - Math.max(0, row.ebit * taxRate / 100),
        14: row.depreciation,
        15: row.capex,
        16: null,
        17: null,
        18: null,
        19: historicalUfcf(row, payload.model.normalizedTaxRate),
        20: null,
        21: null,
        22: null,
        23: null,
        24: row.ebit + row.depreciation,
      };
      Object.entries(actuals).forEach(([rowNumber, value]) => { if (value !== null) build.getCell(`${historyColumns[index + historyOffset]}${rowNumber}`).value = value; });
    });
    forecastColumns.forEach((column, index) => {
      const previousRevenue = index === 0 ? "'Inputs'!$C$9" : `${forecastColumns[index - 1]}6`;
      const inputRow = 36 + index;
      const year = perpetuity.years[index];
      const formulas: Record<number, [string, number]> = {
        6: [`${previousRevenue}*(1+'Inputs'!C${inputRow})`, year.revenue],
        7: [`'Inputs'!C${inputRow}`, year.growth / 100],
        8: [`${column}6*'Inputs'!D${inputRow}`, year.grossProfit],
        9: [`'Inputs'!D${inputRow}`, year.grossMargin / 100],
        10: [`${column}6*'Inputs'!E${inputRow}`, year.ebit],
        11: [`'Inputs'!E${inputRow}`, year.margin / 100],
        12: [`MAX(0,${column}10*'Inputs'!F${inputRow})`, year.tax],
        13: [`${column}10-${column}12`, year.nopat],
        14: [`${column}6*'Inputs'!G${inputRow}`, year.depreciation],
        15: [`${column}6*'Inputs'!H${inputRow}`, year.capex],
        16: [`${column}6*'Inputs'!I${inputRow}`, year.changeNwc],
        17: [`${column}6*'Inputs'!J${inputRow}`, year.deferredTax],
        18: [`${column}6*'Inputs'!K${inputRow}`, year.otherNonCash],
        19: [`${column}13+${column}14-${column}15-${column}16+${column}17+${column}18`, year.fcf],
        22: [`1/(1+'Inputs'!$C$32)^${column}21`, year.discountFactor],
        23: [`${column}19*${column}20*${column}22`, year.pv],
        24: [`${column}10+${column}14`, year.ebitda],
      };
      Object.entries(formulas).forEach(([row, [formula, result]]) => {
        const cell = build.getCell(`${column}${row}`);
        cell.value = formulaCell(formula, result);
        styleFormula(cell, true);
      });
      const weightFormula = index === 0
        ? `MAX(0,MIN(1,('Inputs'!B${inputRow}-'Inputs'!$C$7)/('Inputs'!B${inputRow}-EDATE('Inputs'!B${inputRow},-12))))`
        : index === 5 ? "1-G20" : "1";
      build.getCell(`${column}20`).value = formulaCell(weightFormula, year.weight);
      const periodFormula = index === 0 ? "G20/2" : index === 5 ? "G20+4+L20/2" : `G20+${index - 0.5}`;
      build.getCell(`${column}21`).value = formulaCell(periodFormula, year.discountPeriod);
    });
    const terminalFormulas: Array<[number, string, number]> = [
      [6, "K6*$G$20+L6*$L$20", perpetuity.years[4].revenue * perpetuity.firstYearWeight + perpetuity.years[5].revenue * perpetuity.lastYearWeight],
      [10, "K10*$G$20+L10*$L$20", perpetuity.years[4].ebit * perpetuity.firstYearWeight + perpetuity.years[5].ebit * perpetuity.lastYearWeight],
      [13, "K13*$G$20+L13*$L$20", perpetuity.terminalNopat],
      [19, "M13*(1-'Inputs'!$C$23/'Inputs'!$C$24)", perpetuity.terminalFcf],
      [20, "1", 1], [21, "5", 5], [22, "1/(1+'Inputs'!$C$32)^5", 1 / Math.pow(1 + wacc.selectedWacc / 100, 5)],
      [23, "SUM(G23:L23)", perpetuity.pvForecast],
      [24, "K24*$G$20+L24*$L$20", perpetuity.terminalEbitda],
    ];
    terminalFormulas.forEach(([row, formula, result]) => { build.getCell(row, 13).value = formulaCell(formula, result); });
    styleTableHeader(build.getRow(4), 1, 13); styleTableHeader(build.getRow(5), 1, 13);
    applyBodyStyle(build, "A6:M24");
    [8, 10, 13, 19, 23, 24].forEach((row) => {
      for (let column = 1; column <= 13; column += 1) build.getCell(row, column).border = { top: { style: "thin", color: { argb: navy } }, bottom: { style: "thin", color: { argb: lightBorder } } };
      build.getCell(row, 1).font = { bold: true, color: { argb: navy } };
    });
    for (let row = 6; row <= 24; row += 1) {
      const isPercent = [7, 9, 11, 20].includes(row);
      const isFactor = [21, 22].includes(row);
      for (let column = 2; column <= 13; column += 1) build.getCell(row, column).numFmt = isPercent ? percentFormat : isFactor ? "0.000" : moneyFormat;
    }

    output.columns = [{ width: 3 }, { width: 34 }, { width: 17 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 34 }, { width: 17 }, ...Array.from({ length: 7 }, () => ({ width: 14 }))];
    setTitle(output, "B2:P2", `${payload.company.name} — DCF Output`, "Both terminal methods link to the DCF Build and Inputs sheets.");
    output.getCell("B4").value = "Perpetual Growth Method"; output.getCell("H4").value = "Exit Multiple Method";
    styleSection(output.getRow(4), 2, 3); styleSection(output.getRow(4), 8, 9);
    const pgRows: Array<[number, string, string, number, string]> = [
      [5, "Selected WACC", "'Inputs'!C32", wacc.selectedWacc / 100, percentFormat],
      [6, "Year-5 normalized UFCF", "'DCF Build'!M19", perpetuity.terminalFcf, moneyFormat],
      [7, "Perpetual growth", "'Inputs'!C23", payload.model.terminalGrowth / 100, percentFormat],
      [8, "Terminal value", "C6*(1+C7)/(C5-C7)", perpetuity.terminalValue, moneyFormat],
      [9, "PV of explicit forecast UFCF", "SUM('DCF Build'!G23:L23)", perpetuity.pvForecast, moneyFormat],
      [10, "PV of terminal value", "C8/(1+C5)^5", perpetuity.pvTerminal, moneyFormat],
      [11, "Enterprise value", "C9+C10", perpetuity.enterpriseValue, moneyFormat],
      [12, "Plus: cash", "'Inputs'!C13", payload.model.cash, moneyFormat],
      [13, "Less: funded debt", "-('Inputs'!C14+'Inputs'!C15)", -(payload.model.shortDebt + payload.model.longDebt), moneyFormat],
      [14, "Less: other non-equity claims", "-'Inputs'!C16", -payload.model.preferredInterest, moneyFormat],
      [15, "Common-equity value", "MAX(0,C11+C12+C13+C14)", perpetuity.equityValue, moneyFormat],
      [16, "Diluted shares (mm)", "'Inputs'!C12", payload.model.shares, "#,##0.0"],
      [17, "Implied value per share", "C15/C16", perpetuity.perShare, perShareFormat],
      [18, "Current market price", "'Inputs'!C11", payload.model.marketPrice, perShareFormat],
      [19, "Upside / (downside)", "C17/C18-1", payload.model.marketPrice ? perpetuity.perShare / payload.model.marketPrice - 1 : 0, percentFormat],
    ];
    const exitRows: Array<[number, string, string, number, string]> = [
      [5, "Selected WACC", "'Inputs'!C32", wacc.selectedWacc / 100, percentFormat],
      [6, "Year-5 EBITDA", "'DCF Build'!M24", multiple.terminalEbitda, moneyFormat],
      [7, "Exit EBITDA multiple", "'Inputs'!C25", payload.model.exitMultiple, multipleFormat],
      [8, "Terminal value", "I6*I7", multiple.terminalValue, moneyFormat],
      [9, "PV of explicit forecast UFCF", "SUM('DCF Build'!G23:L23)", multiple.pvForecast, moneyFormat],
      [10, "PV of terminal value", "I8/(1+I5)^5", multiple.pvTerminal, moneyFormat],
      [11, "Enterprise value", "I9+I10", multiple.enterpriseValue, moneyFormat],
      [12, "Plus: cash", "'Inputs'!C13", payload.model.cash, moneyFormat],
      [13, "Less: funded debt", "-('Inputs'!C14+'Inputs'!C15)", -(payload.model.shortDebt + payload.model.longDebt), moneyFormat],
      [14, "Less: other non-equity claims", "-'Inputs'!C16", -payload.model.preferredInterest, moneyFormat],
      [15, "Common-equity value", "MAX(0,I11+I12+I13+I14)", multiple.equityValue, moneyFormat],
      [16, "Diluted shares (mm)", "'Inputs'!C12", payload.model.shares, "#,##0.0"],
      [17, "Implied value per share", "I15/I16", multiple.perShare, perShareFormat],
      [18, "Current market price", "'Inputs'!C11", payload.model.marketPrice, perShareFormat],
      [19, "Upside / (downside)", "I17/I18-1", payload.model.marketPrice ? multiple.perShare / payload.model.marketPrice - 1 : 0, percentFormat],
    ];
    pgRows.forEach(([row, label, formula, result, format]) => { output.getCell(row, 2).value = label; output.getCell(row, 3).value = formulaCell(formula, safeResult(result)); output.getCell(row, 3).numFmt = format; });
    exitRows.forEach(([row, label, formula, result, format]) => { output.getCell(row, 8).value = label; output.getCell(row, 9).value = formulaCell(formula, safeResult(result)); output.getCell(row, 9).numFmt = format; });
    applyBodyStyle(output, "B5:C19"); applyBodyStyle(output, "H5:I19");
    [11, 15, 17].forEach((row) => {
      [2, 3, 8, 9].forEach((column) => { output.getCell(row, column).font = { bold: true, color: { argb: row === 17 ? white : navy } }; });
      if (row === 17) {
        [2, 3, 8, 9].forEach((column) => { output.getCell(row, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: teal } }; });
      }
    });

    output.getCell("D22").value = "Implied Price Per Share — Perpetual Growth";
    output.mergeCells("D22:I22"); output.getCell("D22").alignment = { horizontal: "center" };
    output.getCell("K22").value = "Implied Price Per Share — Exit EBITDA Multiple";
    output.mergeCells("K22:P22"); output.getCell("K22").alignment = { horizontal: "center" };
    ["D22", "K22"].forEach((address) => { output.getCell(address).font = { bold: true, color: { argb: navy } }; });
    const waccScenarios = [wacc.selectedWacc - 0.5, wacc.selectedWacc, wacc.selectedWacc + 0.5];
    const growthScenarios = [-1, -0.5, 0, 0.5, 1].map((delta) => payload.model.terminalGrowth + delta);
    const multipleScenarios = [-4, -2, 0, 2, 4].map((delta) => payload.model.exitMultiple + delta);
    output.getCell("D23").value = "WACC"; output.getCell("K23").value = "WACC";
    growthScenarios.forEach((growth, index) => { output.getCell(23, 5 + index).value = growth / 100; output.getCell(23, 5 + index).numFmt = percentFormat; });
    multipleScenarios.forEach((exitMultiple, index) => { output.getCell(23, 12 + index).value = exitMultiple; output.getCell(23, 12 + index).numFmt = multipleFormat; });
    waccScenarios.forEach((scenarioWacc, rowIndex) => {
      const row = 24 + rowIndex;
      output.getCell(row, 4).value = scenarioWacc / 100; output.getCell(row, 4).numFmt = percentFormat;
      output.getCell(row, 11).value = scenarioWacc / 100; output.getCell(row, 11).numFmt = percentFormat;
      growthScenarios.forEach((growth, columnIndex) => {
        const result = calculateDcf(payload, payload.model, "perpetuity", { wacc: scenarioWacc, terminalGrowth: growth });
        const headerColumn = 5 + columnIndex;
        const formula = `MAX(0,(SUM('DCF Build'!$G$23:$L$23)+(('DCF Build'!$M$13*(1-${output.getCell(23, headerColumn).address}/'Inputs'!$C$24))*(1+${output.getCell(23, headerColumn).address})/($D${row}-${output.getCell(23, headerColumn).address}))/(1+$D${row})^5+'Inputs'!$C$13-'Inputs'!$C$14-'Inputs'!$C$15-'Inputs'!$C$16)/'Inputs'!$C$12)`;
        output.getCell(row, headerColumn).value = formulaCell(formula, safeResult(result.perShare)); output.getCell(row, headerColumn).numFmt = perShareFormat;
      });
      multipleScenarios.forEach((exitMultiple, columnIndex) => {
        const result = calculateDcf(payload, payload.model, "multiple", { wacc: scenarioWacc, exitMultiple });
        const headerColumn = 12 + columnIndex;
        const formula = `MAX(0,(SUM('DCF Build'!$G$23:$L$23)+('DCF Build'!$M$24*${output.getCell(23, headerColumn).address})/(1+$K${row})^5+'Inputs'!$C$13-'Inputs'!$C$14-'Inputs'!$C$15-'Inputs'!$C$16)/'Inputs'!$C$12)`;
        output.getCell(row, headerColumn).value = formulaCell(formula, safeResult(result.perShare)); output.getCell(row, headerColumn).numFmt = perShareFormat;
      });
    });
    styleTableHeader(output.getRow(23), 4, 9); styleTableHeader(output.getRow(23), 11, 16);
    applyBodyStyle(output, "D24:I26"); applyBodyStyle(output, "K24:P26");
    ["G25", "N25"].forEach((address) => { const cell = output.getCell(address); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: teal } }; cell.font = { bold: true, color: { argb: white } }; cell.border = { top: { style: "medium", color: { argb: white } }, bottom: { style: "medium", color: { argb: white } }, left: { style: "medium", color: { argb: white } }, right: { style: "medium", color: { argb: white } } }; });

    comps.columns = [{ width: 3 }, { width: 12 }, { width: 30 }, { width: 15 }, { width: 17 }, { width: 17 }, { width: 15 }, { width: 15 }, { width: 64 }];
    setTitle(comps, "B2:I2", `${payload.company.name} — Comparable Companies`, "Peer selection and ratios are source data from the website, not formulas inferred by Excel.");
    comps.getRow(4).values = [null, "Ticker", "Company", "Peer fit", "Revenue growth", "Operating margin", "EV / Revenue", "EV / EBITDA", "Business similarity"];
    styleTableHeader(comps.getRow(4), 2, 9);
    const peers = payload.comparison?.peers || [];
    peers.forEach((peer, index) => {
      const row = 5 + index;
      comps.getRow(row).values = [null, peer.symbol, peer.name, peer.peerFit || "", peer.revenueGrowth === null ? null : peer.revenueGrowth / 100, peer.operatingMargin === null ? null : peer.operatingMargin / 100, peer.evToRevenue, peer.evToEbitda, peer.peerRationale || ""];
      comps.getCell(row, 5).numFmt = percentFormat; comps.getCell(row, 6).numFmt = percentFormat; comps.getCell(row, 7).numFmt = multipleFormat; comps.getCell(row, 8).numFmt = multipleFormat;
      comps.getCell(row, 9).alignment = { wrapText: true, vertical: "top" };
      comps.getRow(row).height = 48;
    });
    const meanRow = 5 + peers.length;
    comps.getCell(meanRow, 2).value = "Peer mean"; comps.mergeCells(meanRow, 2, meanRow, 3);
    if (peers.length) {
      const peerMetrics = [
        peers.map((peer) => peer.revenueGrowth === null ? null : peer.revenueGrowth / 100),
        peers.map((peer) => peer.operatingMargin === null ? null : peer.operatingMargin / 100),
        peers.map((peer) => peer.evToRevenue),
        peers.map((peer) => peer.evToEbitda),
      ];
      [5, 6, 7, 8].forEach((column, index) => {
        const letter = comps.getColumn(column).letter;
        const valid = peerMetrics[index].filter((value): value is number => value !== null && Number.isFinite(value));
        const mean = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
        comps.getCell(meanRow, column).value = formulaCell(`AVERAGE(${letter}5:${letter}${meanRow - 1})`, mean);
        comps.getCell(meanRow, column).numFmt = column <= 6 ? percentFormat : multipleFormat;
      });
    }
    for (let column = 2; column <= 9; column += 1) { comps.getCell(meanRow, column).font = { bold: true, color: { argb: navy } }; comps.getCell(meanRow, column).border = { top: { style: "thin", color: { argb: navy } } }; }

    checks.columns = [{ width: 3 }, { width: 34 }, { width: 24 }, { width: 24 }, { width: 18 }, { width: 44 }];
    setTitle(checks, "B2:F2", `${payload.company.name} — Sources & Checks`, "Checks recalculate when Excel inputs are edited.");
    checks.getRow(4).values = [null, "Check", "Actual", "Required", "Status", "Notes"];
    styleTableHeader(checks.getRow(4), 2, 6);
    const checkRows: Array<[string, string, number, string, string, string]> = [
      ["WACC exceeds perpetual growth", "'Inputs'!C32-'Inputs'!C23", wacc.selectedWacc / 100 - payload.model.terminalGrowth / 100, "> 0", "IF(C5>0,\"OK\",\"REVIEW\")", "Required for a finite Gordon-growth terminal value."],
      ["Terminal ROIC exceeds positive growth", "'Inputs'!C24-'Inputs'!C23", payload.model.terminalRoic / 100 - payload.model.terminalGrowth / 100, "> 0", "IF(C6>0,\"OK\",\"REVIEW\")", "Keeps required reinvestment below 100% of terminal NOPAT."],
      ["Diluted shares are positive", "'Inputs'!C12", payload.model.shares, "> 0", "IF(C7>0,\"OK\",\"REVIEW\")", "Required to calculate value per share."],
      ["Forecast periods", "COUNTA('Inputs'!B36:B41)", 6, "6", "IF(C8=6,\"OK\",\"REVIEW\")", "The exact five-year method requires six fiscal forecasts."],
      ["UFCF formula tie", "'DCF Build'!G19-('DCF Build'!G13+'DCF Build'!G14-'DCF Build'!G15-'DCF Build'!G16+'DCF Build'!G17+'DCF Build'!G18)", 0, "0", "IF(ABS(C9)<0.01,\"OK\",\"REVIEW\")", "Checks the first forecast year UFCF components."],
      ["Enterprise-value bridge tie", "'DCF Output'!C15-('DCF Output'!C11+'DCF Output'!C12+'DCF Output'!C13+'DCF Output'!C14)", 0, "0", "IF(ABS(C10)<0.01,\"OK\",\"REVIEW\")", "Checks common-equity value before the limited-liability floor."],
    ];
    checkRows.forEach(([label, actualFormula, actualResult, required, statusFormula, note], index) => {
      const row = 5 + index;
      checks.getCell(row, 2).value = label;
      checks.getCell(row, 3).value = formulaCell(actualFormula, actualResult);
      checks.getCell(row, 4).value = required;
      checks.getCell(row, 5).value = formulaCell(statusFormula, "OK");
      checks.getCell(row, 6).value = note;
      checks.getCell(row, 6).alignment = { wrapText: true };
    });
    checks.getCell("C5").numFmt = percentFormat;
    checks.getCell("C6").numFmt = percentFormat;
    checks.getCell("B13").value = "Source / disclosure"; styleSection(checks.getRow(13), 2, 6);
    const sourceRows = [
      ["Company and historical financials", payload.source, payload.asOf, "Public-data extraction shown on the website."],
      ["Market price and share count", payload.source, payload.model.valuationDate, payload.sharesSource || "Verify current diluted shares."],
      ["Forecast drivers", "Website editable assumptions", payload.model.valuationDate, "Every forecast driver is visible on Inputs rows 36–41."],
      ["Valuation formulas", "DCF Valuation Studio", payload.model.valuationDate, "Formula-driven UFCF, WACC, two terminal methods, and enterprise-to-equity bridge."],
    ];
    sourceRows.forEach(([item, source, date, note], index) => {
      const row = 14 + index;
      checks.getCell(row, 2).value = item; checks.getCell(row, 3).value = source; checks.getCell(row, 4).value = date; checks.getCell(row, 6).value = note;
      checks.getCell(row, 6).alignment = { wrapText: true };
    });
    applyBodyStyle(checks, "B5:F10"); applyBodyStyle(checks, "B14:F17");

    for (const sheet of workbook.worksheets) {
      sheet.properties.defaultRowHeight = 18;
      sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
      sheet.headerFooter.oddFooter = "&LDCF Valuation Studio&CPage &P of &N&R" + payload.company.symbol;
    }
    inputs.getCell("B34").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    output.getCell("B19").fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleGreen } };
    output.getCell("H19").fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleGreen } };
    checks.getCell("C5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } };
    cover.getCell("C16").value = "Educational decision support only — not personalized investment advice.";
    cover.getCell("C16").font = { italic: true, color: { argb: gray } };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${payload.company.symbol.replace(/[^A-Z0-9.-]/gi, "-")}-DCF-Model.xlsx`;
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("DCF export failed", error);
    return NextResponse.json({ error: "Unable to create the Excel model." }, { status: 500 });
  }
}
