import type { CompanyData } from "@/lib/company-data";
import { calculateDcf, calculateWacc, fiscalPeriodLabel, type DcfMethod, type DcfModel } from "@/lib/dcf-engine";
import { historicalUfcf } from "@/lib/historical-dcf";

export type VisualSeriesPoint = {
  label: string;
  fiscalPeriodEnd: string | null;
  revenue: number;
  revenueGrowth: number | null;
  ebitda: number;
  ebitdaMargin: number | null;
  ufcf: number;
  ufcfMargin: number | null;
  grossMargin: number | null;
  ebitMargin: number;
  period: "actual" | "forecast";
  revenueStatus: "reported" | "consensus" | "model";
  revenueSource: string;
  revenueSourceAsOf: string | null;
  revenuePeriodType: "full-year";
};

export type ValuationRange = {
  label: string;
  low: number;
  high: number;
  kind: "dcf" | "comps";
};

export type TerminalMix = {
  label: string;
  forecastValue: number;
  terminalValue: number;
  forecastPercent: number | null;
  terminalPercent: number | null;
};

const finite = (values: number[]) => values.filter((value) => Number.isFinite(value));
const range = (label: string, values: number[], kind: ValuationRange["kind"]): ValuationRange | null => {
  const valid = finite(values);
  return valid.length ? { label, low: Math.min(...valid), high: Math.max(...valid), kind } : null;
};

export function buildOperatingSeries(data: CompanyData, result: ReturnType<typeof calculateDcf>): VisualSeriesPoint[] {
  const historical = data.historical.slice(-6);
  const actuals = historical.map((row, index) => {
    const ufcf = historicalUfcf(row, data.metrics.taxRate || 21) ?? row.freeCashFlow;
    const previousRevenue = historical[index - 1]?.revenue;
    return {
      label: row.year,
      fiscalPeriodEnd: row.fiscalDate || null,
      revenue: row.revenue,
      revenueGrowth: previousRevenue && row.revenue ? (row.revenue / previousRevenue - 1) * 100 : null,
      ebitda: row.ebit + row.depreciation,
      ebitdaMargin: row.revenue ? (row.ebit + row.depreciation) / row.revenue * 100 : null,
      ufcf,
      ufcfMargin: row.revenue ? ufcf / row.revenue * 100 : null,
      grossMargin: row.grossMargin ?? (row.cogs === undefined || !row.revenue ? null : (row.revenue - row.cogs) / row.revenue * 100),
      ebitMargin: row.ebitMargin,
      period: "actual" as const,
      revenueStatus: "reported" as const,
      revenueSource: row.revenueSource || "Nasdaq annual financial statements",
      revenueSourceAsOf: row.revenueSourceAsOf || row.fiscalDate || null,
      revenuePeriodType: "full-year" as const,
    };
  }).slice(-5);
  const forecasts = result.years.map((year) => {
    const consensus = data.forecast?.periods?.find((period) => period.periodEnd === year.periodEnd);
    return {
      label: fiscalPeriodLabel(year.periodEnd).replace(" E", ""),
      fiscalPeriodEnd: year.periodEnd,
      revenue: year.revenue,
      revenueGrowth: year.growth,
      ebitda: year.ebitda,
      ebitdaMargin: year.revenue ? year.ebitda / year.revenue * 100 : null,
      ufcf: year.fcf,
      ufcfMargin: year.revenue ? year.fcf / year.revenue * 100 : null,
      grossMargin: year.grossMargin,
      ebitMargin: year.margin,
      period: "forecast" as const,
      revenueStatus: consensus ? "consensus" as const : "model" as const,
      revenueSource: consensus?.source || year.source || "Editable model estimate",
      revenueSourceAsOf: consensus?.asOf || null,
      revenuePeriodType: "full-year" as const,
    };
  });
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
  const rawPeerMultiples = (data.comparison?.peers || [])
    .map((peer) => peer.evToRevenue)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const sortedPeerMultiples = [...rawPeerMultiples].sort((a, b) => a - b);
  const middle = Math.floor(sortedPeerMultiples.length / 2);
  const medianPeerMultiple = sortedPeerMultiples.length % 2
    ? sortedPeerMultiples[middle]
    : (sortedPeerMultiples[middle - 1] + sortedPeerMultiples[middle]) / 2;
  const peerMultiples = sortedPeerMultiples.length >= 3
    ? sortedPeerMultiples.filter((multiple) => multiple >= medianPeerMultiple * 0.4 && multiple <= medianPeerMultiple * 2.5)
    : sortedPeerMultiples;
  const comparableValues = peerMultiples.map((multiple) => {
    const enterpriseValue = data.metrics.revenue * multiple;
    const equityValue = enterpriseValue + model.cash - model.shortDebt - model.longDebt - model.preferredInterest;
    return model.shares > 0 ? Math.max(0, equityValue / model.shares) : Number.NaN;
  });
  return [
    range("Perpetual growth", sensitivityValues("perpetuity", growthRates), "dcf"),
    range("Exit multiple", sensitivityValues("multiple", exitMultiples), "dcf"),
    range("Comparable companies", comparableValues, "comps"),
  ].filter((item): item is ValuationRange => item !== null);
}

export function buildTerminalMix(perpetuity: ReturnType<typeof calculateDcf>, multiple: ReturnType<typeof calculateDcf>): TerminalMix[] {
  return [["Perpetual growth", perpetuity], ["Exit multiple", multiple]].map(([label, raw]) => {
    const result = raw as ReturnType<typeof calculateDcf>;
    const total = result.pvForecast + result.pvTerminal;
    const usable = result.valid && total !== 0;
    return {
      label: String(label),
      forecastValue: result.pvForecast,
      terminalValue: result.pvTerminal,
      forecastPercent: usable ? result.pvForecast / total * 100 : null,
      terminalPercent: usable ? result.pvTerminal / total * 100 : null,
    };
  });
}
