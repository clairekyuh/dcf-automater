import type { CompanyData } from "@/lib/company-data";
import { calculateDcf, calculateWacc, fiscalPeriodLabel, type DcfMethod, type DcfModel } from "@/lib/dcf-engine";
import { historicalUfcf } from "@/lib/historical-dcf";

export type VisualSeriesPoint = {
  label: string;
  revenue: number;
  ebitda: number;
  ufcf: number;
  grossMargin: number | null;
  ebitMargin: number;
  period: "actual" | "forecast";
};

export type ValuationRange = {
  label: string;
  low: number;
  high: number;
  current?: number;
  kind: "dcf" | "market" | "comps";
};

export type TerminalMix = {
  label: string;
  forecastValue: number;
  terminalValue: number;
  forecastPercent: number | null;
  terminalPercent: number | null;
};

const finite = (values: number[]) => values.filter((value) => Number.isFinite(value));
const range = (label: string, values: number[], kind: ValuationRange["kind"], current?: number): ValuationRange | null => {
  const valid = finite(values);
  return valid.length ? { label, low: Math.min(...valid), high: Math.max(...valid), current, kind } : null;
};

export function buildOperatingSeries(data: CompanyData, result: ReturnType<typeof calculateDcf>): VisualSeriesPoint[] {
  const actuals = data.historical.slice(-5).map((row) => ({
    label: row.year,
    revenue: row.revenue,
    ebitda: row.ebit + row.depreciation,
    ufcf: historicalUfcf(row, data.metrics.taxRate || 21) ?? row.freeCashFlow,
    grossMargin: row.grossMargin ?? (row.cogs === undefined || !row.revenue ? null : (row.revenue - row.cogs) / row.revenue * 100),
    ebitMargin: row.ebitMargin,
    period: "actual" as const,
  }));
  const forecasts = result.years.map((year) => ({
    label: fiscalPeriodLabel(year.periodEnd).replace(" E", ""),
    revenue: year.revenue,
    ebitda: year.ebitda,
    ufcf: year.fcf,
    grossMargin: year.grossMargin,
    ebitMargin: year.margin,
    period: "forecast" as const,
  }));
  return [...actuals, ...forecasts];
}

export function buildValuationRanges(data: CompanyData, model: DcfModel): ValuationRange[] {
  const selectedWacc = calculateWacc(model).selectedWacc;
  const waccs = [-1, -.5, 0, .5, 1].map((shift) => Math.max(1, selectedWacc + shift));
  const growthRates = [-1, -.5, 0, .5, 1].map((shift) => Math.max(0, model.terminalGrowth + shift));
  const exitMultiples = [-4, -2, 0, 2, 4].map((shift) => Math.max(1, model.exitMultiple + shift));
  const sensitivityValues = (method: DcfMethod, assumptions: number[]) => waccs.flatMap((wacc) => assumptions.map((assumption) => {
    const result = calculateDcf(data, model, method, method === "perpetuity"
      ? { wacc, terminalGrowth: assumption }
      : { wacc, exitMultiple: assumption });
    return result.valid ? result.perShare : Number.NaN;
  }));
  const peerMultiples = (data.comparison?.peers || [])
    .filter((peer) => peer.peerFit !== "adjacent")
    .map((peer) => peer.evToEbitda)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const peerValues = peerMultiples.map((exitMultiple) => calculateDcf(data, model, "multiple", { exitMultiple }))
    .filter((result) => result.valid)
    .map((result) => result.perShare);
  const prices = data.market.priceHistory || [];
  const latestTime = prices.reduce((latest, point) => Math.max(latest, Date.parse(point.date) || 0), 0);
  const oneYearPrices = prices.filter((point) => latestTime - (Date.parse(point.date) || 0) <= 366 * 86_400_000).map((point) => point.close);
  return [
    range("Perpetual growth", sensitivityValues("perpetuity", growthRates), "dcf"),
    range("Exit multiple", sensitivityValues("multiple", exitMultiples), "dcf"),
    peerValues.length >= 2 ? range("Peer multiples", peerValues, "comps") : null,
    range("52-week price", oneYearPrices, "market", model.marketPrice),
  ].filter((item): item is ValuationRange => item !== null);
}

export function buildTerminalMix(perpetuity: ReturnType<typeof calculateDcf>, multiple: ReturnType<typeof calculateDcf>): TerminalMix[] {
  return [["Perpetual growth", perpetuity], ["Exit multiple", multiple]].map(([label, raw]) => {
    const result = raw as ReturnType<typeof calculateDcf>;
    const total = result.pvForecast + result.pvTerminal;
    const usable = result.valid && total > 0 && result.pvForecast >= 0 && result.pvTerminal >= 0;
    return {
      label: String(label),
      forecastValue: result.pvForecast,
      terminalValue: result.pvTerminal,
      forecastPercent: usable ? result.pvForecast / total * 100 : null,
      terminalPercent: usable ? result.pvTerminal / total * 100 : null,
    };
  });
}
