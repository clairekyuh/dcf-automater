export type HistoricalDcfInput = {
  year: string;
  fiscalDate?: string;
  revenue: number;
  operatingCashFlow: number;
  capex: number;
  interestExpense?: number;
  incomeTax?: number;
  earningsBeforeTax?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function historicalRevenueGrowth(rows: HistoricalDcfInput[], index: number) {
  const current = rows[index];
  const previous = rows[index - 1];
  if (!current || !previous || previous.revenue <= 0) return null;
  return (current.revenue / previous.revenue - 1) * 100;
}

export function historicalEffectiveTaxRate(row: HistoricalDcfInput) {
  if (!row.earningsBeforeTax || row.earningsBeforeTax <= 0 || row.incomeTax === undefined) return null;
  // A normalized historical proxy avoids allowing a one-time tax item to make
  // an operating-tax line negative or implausibly large.
  return clamp(Math.abs(row.incomeTax) / row.earningsBeforeTax * 100, 0, 50);
}

export function historicalUfcf(row: HistoricalDcfInput, fallbackTaxRate: number) {
  if (!Number.isFinite(row.operatingCashFlow) || !Number.isFinite(row.capex)) return null;
  const taxRate = historicalEffectiveTaxRate(row) ?? clamp(fallbackTaxRate, 0, 50);
  const afterTaxInterest = Math.max(0, row.interestExpense || 0) * (1 - taxRate / 100);
  return row.operatingCashFlow - Math.abs(row.capex) + afterTaxInterest;
}

export function actualFiscalLabel(row: Pick<HistoricalDcfInput, "year" | "fiscalDate">) {
  if (!row.fiscalDate) return `FY${row.year} A`;
  const date = new Date(`${row.fiscalDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return `FY${row.year} A`;
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date).toUpperCase();
  return `${month} ${String(date.getUTCFullYear()).slice(-2)} A`;
}
