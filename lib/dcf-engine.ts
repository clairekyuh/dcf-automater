export type DcfMethod = "perpetuity" | "multiple";

export type ForecastDriver = {
  periodEnd: string;
  source: string;
  revenueGrowth: number;
  grossMargin: number;
  ebitMargin: number;
  taxRate: number;
  daPercent: number;
  capexPercent: number;
  changeNwcPercent: number;
  deferredTaxPercent: number;
  otherNonCashPercent: number;
};

export type DcfModel = {
  forecastDrivers: ForecastDriver[];
  normalizedTaxRate: number;
  riskFreeRate: number;
  beta: number;
  equityRiskPremium: number;
  preTaxCostDebt: number;
  companyRiskPremium: number;
  terminalGrowth: number;
  terminalRoic: number;
  exitMultiple: number;
  cash: number;
  shortDebt: number;
  longDebt: number;
  preferredInterest: number;
  shares: number;
  marketPrice: number;
  valuationDate: string;
};

export type DcfData = {
  metrics: { revenue: number };
};

const DAY = 86_400_000;

export const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function localValuationDate(timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addYears(date: string, years: number) {
  const source = new Date(`${date}T00:00:00Z`);
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const result = new Date(Date.UTC(source.getUTCFullYear() + years, month, day));
  // February 29 rolls into March in a non-leap year; use the fiscal month's last day instead.
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return result.toISOString().slice(0, 10);
}

export function fiscalPeriodLabel(periodEnd: string) {
  const date = new Date(`${periodEnd}T00:00:00Z`);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date).toUpperCase();
  return `${month} ${String(date.getUTCFullYear()).slice(-2)} E`;
}

export function calculateWacc(model: DcfModel) {
  const equity = Math.max(0, model.marketPrice * model.shares);
  const debt = Math.max(0, model.shortDebt + model.longDebt);
  const capital = Math.max(1, equity + debt);
  const equityWeight = equity / capital;
  const debtWeight = debt / capital;
  const costEquity = model.riskFreeRate + model.beta * model.equityRiskPremium;
  const afterTaxCostDebt = model.preTaxCostDebt * (1 - clampNumber(model.normalizedTaxRate, 0, 100) / 100);
  const baseWacc = costEquity * equityWeight + afterTaxCostDebt * debtWeight;
  return {
    equity,
    debt,
    equityWeight,
    debtWeight,
    costEquity,
    afterTaxCostDebt,
    baseWacc,
    selectedWacc: baseWacc + model.companyRiskPremium,
  };
}

export function forecastTiming(model: Pick<DcfModel, "forecastDrivers" | "valuationDate">) {
  if (model.forecastDrivers.length !== 6) throw new Error("The DCF requires exactly six fiscal forecast periods to value an exact five-year window.");
  const latestFiscalEnd = new Date(`${addYears(model.forecastDrivers[0].periodEnd, -1)}T00:00:00Z`).getTime();
  const firstForecastEnd = new Date(`${model.forecastDrivers[0].periodEnd}T00:00:00Z`).getTime();
  const valuationDate = new Date(`${model.valuationDate}T00:00:00Z`).getTime();
  const daysInFirstPeriod = Math.max(1, (firstForecastEnd - latestFiscalEnd) / DAY);
  const firstYearWeight = clampNumber(((firstForecastEnd - valuationDate) / DAY) / daysInFirstPeriod, 0, 1);
  const lastYearWeight = 1 - firstYearWeight;
  return {
    firstYearWeight,
    lastYearWeight,
    weights: [firstYearWeight, 1, 1, 1, 1, lastYearWeight],
    periods: [
      firstYearWeight / 2,
      firstYearWeight + 0.5,
      firstYearWeight + 1.5,
      firstYearWeight + 2.5,
      firstYearWeight + 3.5,
      firstYearWeight + 4 + lastYearWeight / 2,
    ],
  };
}

export function validateModelInputs(data: DcfData, model: DcfModel) {
  if (!Number.isFinite(data.metrics.revenue) || data.metrics.revenue <= 0) return "Starting revenue must be a positive finite number.";
  if (model.forecastDrivers.length !== 6) return "The DCF requires exactly six fiscal forecast periods.";
  const percentageFields: Array<keyof Omit<ForecastDriver, "periodEnd" | "source">> = [
    "revenueGrowth", "grossMargin", "ebitMargin", "taxRate", "daPercent", "capexPercent", "changeNwcPercent", "deferredTaxPercent", "otherNonCashPercent",
  ];
  for (let index = 0; index < model.forecastDrivers.length; index += 1) {
    const driver = model.forecastDrivers[index];
    if (!driver.periodEnd || !Number.isFinite(new Date(`${driver.periodEnd}T00:00:00Z`).getTime())) return `Forecast Year ${index + 1} needs a valid fiscal period end.`;
    for (const field of percentageFields) if (!Number.isFinite(driver[field])) return `Forecast Year ${index + 1} ${field} must be a finite number.`;
    if (driver.revenueGrowth <= -100) return `Forecast Year ${index + 1} revenue growth must be greater than -100%.`;
    if (driver.grossMargin > 100) return `Forecast Year ${index + 1} gross margin cannot exceed 100%.`;
    if (driver.ebitMargin > driver.grossMargin) return `Forecast Year ${index + 1} EBIT margin cannot exceed gross margin.`;
    if (driver.taxRate < 0 || driver.taxRate > 100) return `Forecast Year ${index + 1} tax rate must be between 0% and 100%.`;
    if (driver.daPercent < 0 || driver.capexPercent < 0) return `Forecast Year ${index + 1} D&A and capex cannot be negative.`;
  }
  const scalarValues = [model.normalizedTaxRate, model.riskFreeRate, model.beta, model.equityRiskPremium, model.preTaxCostDebt, model.companyRiskPremium, model.terminalGrowth, model.terminalRoic, model.exitMultiple, model.cash, model.shortDebt, model.longDebt, model.preferredInterest, model.shares, model.marketPrice];
  if (!scalarValues.every(Number.isFinite)) return "All valuation assumptions must be finite numbers.";
  if ([model.cash, model.shortDebt, model.longDebt, model.preferredInterest].some((value) => value < 0)) return "Cash, debt, and other non-equity claims cannot be negative.";
  return null;
}

export function calculateDcf(
  data: DcfData,
  model: DcfModel,
  method: DcfMethod,
  overrides: { wacc?: number; terminalGrowth?: number; exitMultiple?: number } = {},
) {
  const inputError = validateModelInputs(data, model);
  const waccPercent = overrides.wacc ?? calculateWacc(model).selectedWacc;
  const terminalGrowth = overrides.terminalGrowth ?? model.terminalGrowth;
  const exitMultiple = overrides.exitMultiple ?? model.exitMultiple;
  const wacc = waccPercent / 100;
  const timing = forecastTiming(model);
  let previousRevenue = data.metrics.revenue;

  const years = model.forecastDrivers.map((driver, index) => {
    const revenue = previousRevenue * (1 + driver.revenueGrowth / 100);
    const grossProfit = revenue * driver.grossMargin / 100;
    const costRevenue = revenue - grossProfit;
    const ebit = revenue * driver.ebitMargin / 100;
    const operatingExpenses = grossProfit - ebit;
    const tax = Math.max(0, ebit * driver.taxRate / 100);
    const nopat = ebit - tax;
    const depreciation = revenue * driver.daPercent / 100;
    const capex = revenue * driver.capexPercent / 100;
    const changeNwc = revenue * driver.changeNwcPercent / 100;
    const deferredTax = revenue * driver.deferredTaxPercent / 100;
    const otherNonCash = revenue * driver.otherNonCashPercent / 100;
    const fcf = nopat + depreciation - capex - changeNwc + deferredTax + otherNonCash;
    const ebitda = ebit + depreciation;
    const discountFactor = 1 / Math.pow(1 + wacc, timing.periods[index]);
    const row = {
      year: new Date(`${driver.periodEnd}T00:00:00Z`).getUTCFullYear(),
      periodEnd: driver.periodEnd,
      source: driver.source,
      growth: driver.revenueGrowth,
      margin: driver.ebitMargin,
      grossMargin: driver.grossMargin,
      daPercent: driver.daPercent,
      capexPercent: driver.capexPercent,
      nwcPercent: driver.changeNwcPercent,
      deferredTaxPercent: driver.deferredTaxPercent,
      otherNonCashPercent: driver.otherNonCashPercent,
      revenue,
      costRevenue,
      grossProfit,
      operatingExpenses,
      ebit,
      tax,
      taxRate: driver.taxRate,
      nopat,
      depreciation,
      capex,
      changeNwc,
      deferredTax,
      otherNonCash,
      fcf,
      ebitda,
      weight: timing.weights[index],
      discountPeriod: timing.periods[index],
      discountFactor,
      pv: fcf * timing.weights[index] * discountFactor,
    };
    previousRevenue = revenue;
    return row;
  });

  const terminalForecastFcf = years[4].fcf * timing.firstYearWeight + years[5].fcf * timing.lastYearWeight;
  const terminalEbitda = years[4].ebitda * timing.firstYearWeight + years[5].ebitda * timing.lastYearWeight;
  const terminalNopat = years[4].nopat * timing.firstYearWeight + years[5].nopat * timing.lastYearWeight;
  const terminalReinvestmentRate = model.terminalRoic > 0 ? terminalGrowth / model.terminalRoic : null;
  const normalizedTerminalFcf = terminalReinvestmentRate === null ? 0 : terminalNopat * (1 - terminalReinvestmentRate);
  const terminalFcf = method === "perpetuity" ? normalizedTerminalFcf : terminalForecastFcf;
  const commonValid = inputError === null && waccPercent > 0 && model.shares > 0;
  const valid = method === "perpetuity"
    ? commonValid
      && waccPercent > terminalGrowth
      && model.terminalRoic > 0
      && (terminalGrowth <= 0 || model.terminalRoic > terminalGrowth)
      && terminalNopat > 0
      && terminalFcf > 0
    : commonValid && exitMultiple > 0 && terminalEbitda > 0;
  const terminalValue = method === "perpetuity"
    ? valid ? terminalFcf * (1 + terminalGrowth / 100) / (wacc - terminalGrowth / 100) : 0
    : valid ? terminalEbitda * exitMultiple : 0;
  const pvTerminal = terminalValue / Math.pow(1 + wacc, 5);
  const pvForecast = years.reduce((sum, year) => sum + year.pv, 0);
  const enterpriseValue = pvForecast + pvTerminal;
  const totalDebt = model.shortDebt + model.longDebt;
  const rawEquityValue = enterpriseValue + model.cash - totalDebt - model.preferredInterest;
  const equityValue = Math.max(0, rawEquityValue);
  const perShare = equityValue / Math.max(model.shares, 1);
  const impliedTerminalRoic = method === "perpetuity" && terminalReinvestmentRate !== null ? model.terminalRoic : null;

  return {
    valid,
    invalidReason: valid ? null
      : inputError
      || (waccPercent <= 0 ? "WACC must be positive."
      : model.shares <= 0 ? "The diluted share count must be positive."
      : method === "multiple" && exitMultiple <= 0 ? "The exit multiple must be positive."
      : method === "multiple" && terminalEbitda <= 0 ? "Year-5 EBITDA must be positive for the exit-multiple method."
      : waccPercent <= terminalGrowth ? "WACC must be greater than perpetual growth."
      : model.terminalRoic <= 0 ? "Terminal ROIC must be positive."
      : terminalGrowth > 0 && model.terminalRoic <= terminalGrowth ? "Terminal ROIC must exceed positive perpetual growth so reinvestment remains below 100% of NOPAT."
      : terminalNopat <= 0 ? "Year-5 NOPAT must be positive for a going-concern perpetuity."
      : "Normalized terminal free cash flow must be positive."),
    years,
    ...timing,
    waccPercent,
    terminalFcf,
    terminalForecastFcf,
    terminalEbitda,
    terminalNopat,
    terminalValue,
    pvTerminal,
    pvForecast,
    enterpriseValue,
    rawEquityValue,
    equityValue,
    perShare,
    terminalShare: enterpriseValue ? pvTerminal / enterpriseValue * 100 : 0,
    terminalReinvestmentRate,
    impliedTerminalRoic,
  };
}

export function isStandardDcfUnsupported(company: { sector?: string; industry?: string; description?: string }) {
  const primaryClassification = `${company.sector || ""} ${company.industry || ""}`;
  const financialInstitution = /\bbanks?\b|\bbanking\b|\bbancorp\b|\binsurance\b|\binsurer\b|brokerage|investment banking|consumer finance/i;

  if (financialInstitution.test(primaryClassification)) return true;

  // Some providers use “financial services” as the actual industry label. Do
  // not apply that phrase to the business description: retailers and other
  // operating companies can offer ancillary financial services without being
  // financial institutions.
  const industry = company.industry?.trim() || "";
  if (/^(?:diversified )?financial services$/i.test(industry)) return true;

  // Description is only a fallback for specific institution language, never
  // the generic phrase “financial services.”
  return financialInstitution.test(company.description || "");
}
