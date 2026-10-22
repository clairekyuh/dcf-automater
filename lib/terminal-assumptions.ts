type RoicRow = {
  fiscalDate?: string;
  year: string;
  ebit: number;
  cash?: number;
  debt?: number;
  totalAssets?: number;
  totalLiabilities?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function investedCapital(row: RoicRow) {
  const values = [row.totalAssets, row.totalLiabilities, row.debt, row.cash];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const bookEquity = row.totalAssets! - row.totalLiabilities!;
  const capital = bookEquity + row.debt! - row.cash!;
  return capital > 0 ? capital : null;
}

/**
 * Estimates a transparent terminal incremental-ROIC starting point. Historical
 * accounting ROIC is only a reference: most of its excess spread is faded and
 * the retained spread is capped. When book capital is not usable, WACC remains
 * the disclosed no-excess-return fallback.
 */
export function estimateTerminalRoic(rows: RoicRow[], taxRate: number, wacc: number) {
  const ordered = [...rows].sort((a, b) => String(a.fiscalDate || a.year).localeCompare(String(b.fiscalDate || b.year)));
  const observations: Array<{ period: string; roic: number; nopat: number; averageInvestedCapital: number }> = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const currentCapital = investedCapital(ordered[index]);
    const priorCapital = investedCapital(ordered[index - 1]);
    if (currentCapital === null || priorCapital === null || !Number.isFinite(ordered[index].ebit)) continue;
    const averageInvestedCapital = (currentCapital + priorCapital) / 2;
    if (averageInvestedCapital <= 0) continue;
    const nopat = ordered[index].ebit * (1 - clamp(taxRate, 0, 50) / 100);
    const roic = nopat / averageInvestedCapital * 100;
    if (!Number.isFinite(roic) || roic <= 0 || roic > 200) continue;
    observations.push({ period: ordered[index].fiscalDate || ordered[index].year, roic, nopat, averageInvestedCapital });
  }
  const historicalMedian = median(observations.map((observation) => observation.roic));
  if (historicalMedian === null) {
    return {
      value: wacc,
      historicalMedian: null,
      observations,
      confidence: "low" as const,
      source: "WACC fallback because at least one comparable historical invested-capital interval was unavailable.",
    };
  }
  const retainedSpread = clamp((historicalMedian - wacc) * .25, 0, 6);
  const value = clamp(wacc + retainedSpread, wacc, 20);
  return {
    value,
    historicalMedian,
    observations,
    confidence: observations.length >= 2 ? "medium" as const : "low" as const,
    source: `Historical median accounting ROIC ${historicalMedian.toFixed(1)}%; automatic terminal starting point retains 25% of the excess over WACC, capped at a 6-point spread. This is an editable model estimate, not consensus.`,
  };
}
