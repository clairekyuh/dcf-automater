export type CashFlowReconciliationInput = {
  period: string;
  revenue: number;
  ebit: number;
  taxRate: number;
  depreciationAndAmortization: number;
  capex: number;
  operatingCashFlow: number;
  interestExpense?: number | null;
  shareBasedCompensation?: number | null;
  contractCostAmortization?: number | null;
  contractCostAssetCurrent?: number | null;
  contractCostAssetPrior?: number | null;
  deferredTaxCashFlowAdjustment?: number | null;
};

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Reconciles two different cash-flow views without claiming they should equal.
 * CFO less capex is levered and includes working-capital and noncash statement
 * adjustments. EBIT-derived FCFF requires those items to be forecast explicitly.
 */
export function reconcileHistoricalCashFlow(input: CashFlowReconciliationInput) {
  const taxRate = clamp(input.taxRate, 0, 50) / 100;
  const nopat = input.ebit * (1 - taxRate);
  const reportedFreeCashFlow = input.operatingCashFlow - input.capex;
  const afterTaxInterest = Math.max(0, input.interestExpense || 0) * (1 - taxRate);
  const reportedUfcfProxy = reportedFreeCashFlow + afterTaxInterest;
  const ebitDerivedBeforeOtherItems = nopat + input.depreciationAndAmortization - input.capex;
  const residualCashConversion = reportedUfcfProxy - ebitDerivedBeforeOtherItems;
  const residualPercentRevenue = input.revenue ? residualCashConversion / input.revenue * 100 : null;
  const contractCostAssetChange = finite(input.contractCostAssetCurrent) && finite(input.contractCostAssetPrior)
    ? input.contractCostAssetCurrent - input.contractCostAssetPrior
    : null;
  const material = residualPercentRevenue !== null && Math.abs(residualPercentRevenue) > 5;
  return {
    period: input.period,
    reportedFreeCashFlow,
    afterTaxInterest,
    reportedUfcfProxy,
    nopat,
    depreciationAndAmortization: input.depreciationAndAmortization,
    capex: input.capex,
    ebitDerivedBeforeOtherItems,
    residualCashConversion,
    residualPercentRevenue,
    status: material ? "review" as const : "reconciled" as const,
    knownDrivers: {
      shareBasedCompensation: finite(input.shareBasedCompensation) ? input.shareBasedCompensation : null,
      contractCostAmortization: finite(input.contractCostAmortization) ? input.contractCostAmortization : null,
      contractCostAssetChange,
      deferredTaxCashFlowAdjustment: finite(input.deferredTaxCashFlowAdjustment) ? input.deferredTaxCashFlowAdjustment : null,
    },
    explanation: material
      ? "Reported CFO-based cash flow differs materially from the EBIT-derived starting bridge. Reconcile working capital and recurring noncash or operating-asset items before treating either measure as normalized UFCF."
      : "The CFO-based proxy and EBIT-derived starting bridge are within the materiality threshold. They remain different definitions.",
  };
}
