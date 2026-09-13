export type CorporateCreditScreenInput = {
  debtToRevenue: number | null;
  netDebtToEbitda: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  fcfToDebt: number | null;
  ebitda: number | null;
  freeCashFlow: number | null;
};

export type CorporateCreditScreenResult = {
  level: "high" | "moderate" | "low" | "insufficient";
  points: number;
  availableChecks: number;
  drivers: string[];
};

export function defaultRiskScreen(values: CorporateCreditScreenInput): CorporateCreditScreenResult {
  let points = 0;
  const drivers: string[] = [];
  const add = (condition: boolean, score: number, driver: string) => { if (condition) { points += score; drivers.push(driver); } };
  const availableChecks = [values.debtToRevenue, values.netDebtToEbitda, values.currentRatio, values.interestCoverage, values.fcfToDebt].filter((value) => value !== null).length;
  if (values.debtToRevenue !== null) {
    add(values.debtToRevenue > 1.5, 2, "Debt is high relative to revenue.");
    add(values.debtToRevenue > .75 && values.debtToRevenue <= 1.5, 1, "Debt is elevated relative to revenue.");
  }
  if (values.netDebtToEbitda !== null) {
    add(values.netDebtToEbitda > 4, 2, "Net debt exceeds four times EBITDA.");
    add(values.netDebtToEbitda > 2.5 && values.netDebtToEbitda <= 4, 1, "Net debt is elevated relative to EBITDA.");
  }
  if (values.currentRatio !== null) {
    add(values.currentRatio < 1, 2, "Current liabilities exceed current assets.");
    add(values.currentRatio >= 1 && values.currentRatio < 1.5, 1, "Short-term liquidity is limited.");
  }
  if (values.interestCoverage !== null) {
    add(values.interestCoverage < 1.5, 2, "Operating income provides weak interest coverage.");
    add(values.interestCoverage >= 1.5 && values.interestCoverage < 3, 1, "Interest coverage has a limited cushion.");
  }
  if (values.fcfToDebt !== null) {
    add(values.fcfToDebt < 0, 2, "Free cash flow is negative relative to debt.");
    add(values.fcfToDebt >= 0 && values.fcfToDebt < .1, 1, "Free cash flow covers less than 10% of funded debt.");
  }
  add(values.ebitda !== null && values.ebitda <= 0, 2, "EBITDA is non-positive, weakening debt-service capacity.");
  add(values.freeCashFlow !== null && values.freeCashFlow < 0 && (values.fcfToDebt === null || values.fcfToDebt >= 0), 1, "Free cash flow is negative.");
  if (availableChecks < 3) {
    return {
      level: "insufficient",
      points,
      availableChecks,
      drivers: ["Fewer than three core solvency ratios could be calculated from the latest SEC annual facts, so the model will not label the company low risk."],
    };
  }
  return {
    level: points >= 6 ? "high" : points >= 3 ? "moderate" : "low",
    points,
    availableChecks,
    drivers: drivers.length ? drivers : ["The available leverage, liquidity, coverage, and cash-flow ratios do not show an obvious near-term default warning."],
  };
}
