import type { HistoricalRow, RevenueDataQuality, RevenueInterimResult, RevenueReconciliation } from "@/lib/company-data";

export type AnnualRevenueSource = {
  fiscalDate: string;
  revenue: number;
  source: string;
  sourceUrl?: string;
  sourceAsOf?: string;
  originalUnit: string;
  normalizedUnit: "USD millions";
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validAnnualSource(row: AnnualRevenueSource) {
  return ISO_DATE.test(row.fiscalDate) && Number.isFinite(row.revenue) && row.revenue > 0;
}

function annualGrowth(current: number, previous: number) {
  return previous > 0 ? (current / previous - 1) * 100 : null;
}

function dedupeSources(rows: AnnualRevenueSource[]) {
  const ordered = rows.filter(validAnnualSource).sort((first, second) => {
    const dateOrder = first.fiscalDate.localeCompare(second.fiscalDate);
    return dateOrder || (first.sourceAsOf || "").localeCompare(second.sourceAsOf || "");
  });
  return [...new Map(ordered.map((row) => [row.fiscalDate, row])).values()];
}

export function reconcileRevenueHistory(
  nasdaqRows: HistoricalRow[],
  secRows: AnnualRevenueSource[],
): { historical: HistoricalRow[]; revenueData: RevenueDataQuality } {
  const invalidRows = nasdaqRows.filter((row) => !row.fiscalDate || !ISO_DATE.test(row.fiscalDate) || !Number.isFinite(row.revenue) || row.revenue <= 0);
  const validNasdaq = nasdaqRows
    .filter((row) => row.fiscalDate && ISO_DATE.test(row.fiscalDate) && Number.isFinite(row.revenue) && row.revenue > 0)
    .sort((first, second) => first.fiscalDate!.localeCompare(second.fiscalDate!));
  const dedupedNasdaq = [...new Map(validNasdaq.map((row) => [row.fiscalDate!, row])).values()];
  const dedupedSec = dedupeSources(secRows);
  const secByDate = new Map(dedupedSec.map((row) => [row.fiscalDate, row]));
  const reconciliation: RevenueReconciliation[] = [];
  const issues: string[] = invalidRows.length ? [`Excluded ${invalidRows.length} invalid annual revenue period${invalidRows.length === 1 ? "" : "s"}.`] : [];
  let hasConflict = false;

  const historical = dedupedNasdaq.map((row) => {
    const sec = secByDate.get(row.fiscalDate!);
    if (!sec) return {
      ...row,
      revenueStatus: "reported" as const,
      revenueSource: "Nasdaq annual financial statements",
      revenueSourceAsOf: row.revenueSourceAsOf,
      revenueOriginalUnit: "USD thousands",
      revenueNormalizedUnit: "USD millions" as const,
      revenuePeriodType: "full-year" as const,
    };

    const differencePercent = Math.abs(sec.revenue - row.revenue) / Math.max(Math.abs(sec.revenue), 1) * 100;
    const status = differencePercent <= 1 ? "matched" as const : "conflicting" as const;
    reconciliation.push({ fiscalDate: row.fiscalDate!, secRevenue: sec.revenue, nasdaqRevenue: row.revenue, differencePercent, status });
    if (status === "conflicting") {
      hasConflict = true;
      issues.push(`SEC and Nasdaq annual revenue differ by ${differencePercent.toFixed(1)}% for ${row.fiscalDate}.`);
    }
    const revenue = sec.revenue;
    const grossMargin = row.cogs === undefined ? row.grossMargin : (revenue - row.cogs) / revenue * 100;
    return {
      ...row,
      revenue,
      ebitMargin: row.ebit / revenue * 100,
      capexPercentRevenue: row.capex / revenue * 100,
      grossMargin,
      revenueStatus: "reported" as const,
      revenueSource: sec.source,
      revenueSourceUrl: sec.sourceUrl,
      revenueSourceAsOf: sec.sourceAsOf,
      revenueOriginalUnit: sec.originalUnit,
      revenueNormalizedUnit: sec.normalizedUnit,
      revenuePeriodType: "full-year" as const,
      revenueReconciliation: status,
    };
  });

  for (let index = 1; index < historical.length; index += 1) {
    const previous = historical[index - 1];
    const current = historical[index];
    const previousYear = Number(previous.fiscalDate?.slice(0, 4));
    const currentYear = Number(current.fiscalDate?.slice(0, 4));
    if (currentYear - previousYear !== 1) issues.push(`Annual revenue history has a gap before ${current.fiscalDate}.`);
    const daysBetweenFiscalEnds = previous.fiscalDate && current.fiscalDate
      ? (Date.parse(current.fiscalDate) - Date.parse(previous.fiscalDate)) / 86_400_000
      : 0;
    if (daysBetweenFiscalEnds < 320 || daysBetweenFiscalEnds > 410) issues.push(`Fiscal year-end dates conflict at ${current.fiscalDate}.`);
    const ratio = current.revenue / previous.revenue;
    if (ratio >= 100 || ratio <= .01) issues.push(`Revenue changes by more than 100 times at ${current.fiscalDate}; verify source units.`);
  }

  const missingLatestSecPeriod = dedupedSec.at(-1)?.fiscalDate && dedupedSec.at(-1)!.fiscalDate > (historical.at(-1)?.fiscalDate || "")
    ? dedupedSec.at(-1)!.fiscalDate
    : null;
  if (missingLatestSecPeriod) issues.push(`SEC reports a newer annual period (${missingLatestSecPeriod}) that is not available in the complete operating history.`);

  const hasGap = issues.some((issue) => issue.includes("gap before"));
  const hasFiscalConflict = issues.some((issue) => issue.includes("Fiscal year-end dates conflict"));
  const hasUnitWarning = issues.some((issue) => issue.includes("source units"));
  const quality = hasConflict
    ? "conflicting" as const
    : historical.length === 0
    ? "unavailable" as const
    : historical.length < 2 || invalidRows.length > 0 || hasGap || hasFiscalConflict || hasUnitWarning || Boolean(missingLatestSecPeriod)
    ? "partial" as const
    : "complete" as const;

  return {
    historical,
    revenueData: {
      quality,
      issues,
      reconciliation,
      historicalSourcePriority: "SEC annual filings, then Nasdaq annual financial statements",
      latestInterim: null,
    },
  };
}

export function withInterimRevenue(data: RevenueDataQuality, latestInterim: RevenueInterimResult | null): RevenueDataQuality {
  return { ...data, latestInterim };
}

export function calculatedRevenueGrowth(rows: Array<Pick<HistoricalRow, "revenue">>, index: number) {
  if (index <= 0 || index >= rows.length) return null;
  return annualGrowth(rows[index].revenue, rows[index - 1].revenue);
}
