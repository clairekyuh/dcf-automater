import { isStandardDcfUnsupported } from "@/lib/dcf-engine";

type DcfApplicabilityInput = {
  company: { sector?: string; industry?: string; description?: string };
  metrics: { revenue: number; ebitMargin: number; cash: number; capexPercentRevenue?: number };
  historical?: Array<{ ebitMargin?: number; revenue?: number }>;
  denomination?: { issuerReportingCurrency?: string; financialDisplayCurrency?: string; fxRate?: number | null; normalizationStatus?: string };
};

export type DcfApplicability =
  | { supported: true }
  | {
    supported: false;
    code: "financial-institution" | "reit" | "pipeline-biotech" | "digital-asset-treasury" | "persistent-loss" | "capital-intensive-turnaround" | "insufficient-history" | "currency-unverified";
    label: string;
    shortDetail: string;
    detail: string;
  };

export function assessStandardDcfApplicability(data: DcfApplicabilityInput): DcfApplicability {
  const classification = `${data.company.sector || ""} ${data.company.industry || ""}`;
  const description = data.company.description || "";

  if (isStandardDcfUnsupported(data.company)) {
    return {
      supported: false,
      code: "financial-institution",
      label: "BANK OR INSURER MODEL REQUIRED",
      shortDetail: "Use an equity model tied to regulatory capital",
      detail: "This automated UFCF model treats debt as financing. For banks and insurers, debt, interest, and regulatory capital are part of operations. Use residual income, excess return, dividend discount, or price-to-tangible-book analysis instead.",
    };
  }

  if (/real estate investment trusts?|\breit\b/i.test(classification)) {
    return {
      supported: false,
      code: "reit",
      label: "REIT MODEL REQUIRED",
      shortDetail: "Use AFFO, NAV, or property cash flows",
      detail: "This automated corporate DCF does not separate maintenance capex from acquisitions and development, and GAAP property depreciation does not represent REIT economics well. Use AFFO, net asset value, or a property-level cash-flow model instead.",
    };
  }

  const pipelineBiotech = /biotech|biopharma|biological products/i.test(classification)
    && /pipeline|clinical|product candidates?|gene edit|therapeutic/i.test(description)
    && data.metrics.ebitMargin < -100
    && data.metrics.revenue < Math.max(100, data.metrics.cash * .1);
  if (pipelineBiotech) {
    return {
      supported: false,
      code: "pipeline-biotech",
      label: "PIPELINE MODEL REQUIRED",
      shortDetail: "Use probability-weighted product scenarios",
      detail: "This company has a small commercial revenue base and pipeline outcomes that depend on trials, approvals, launch timing, and market adoption. The automated smooth-growth forecast omits those probabilities. Use a product-level risk-adjusted NPV model instead.",
    };
  }

  const digitalAssetTreasury = /bitcoin treasury company|bitcoin-focused capital management|digital asset treasury|primary treasury reserve asset/i.test(description);
  if (digitalAssetTreasury) {
    return {
      supported: false,
      code: "digital-asset-treasury",
      label: "ASSET NAV REQUIRED",
      shortDetail: "Value the treasury assets separately",
      detail: "Material digital-asset holdings and related financing are not captured by this operating cash-flow model. Use a sum-of-the-parts analysis that combines the operating business with current asset NAV and all debt, preferred claims, and dilution.",
    };
  }

  if (data.historical && data.historical.length < 2) {
    return {
      supported: false,
      code: "insufficient-history",
      label: "INSUFFICIENT OPERATING HISTORY",
      shortDetail: "At least two comparable annual periods are required",
      detail: "The automated model cannot validate growth, margins, reinvestment, cash conversion, or normalized taxes from one annual period. Build an explicit operating plan and probability-weighted scenarios before using a terminal value.",
    };
  }

  const recentMargins = (data.historical || []).slice(-3).map((row) => row.ebitMargin).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (recentMargins.length >= 2 && recentMargins.every((margin) => margin < 0)) {
    return {
      supported: false,
      code: "persistent-loss",
      label: "TURNAROUND MODEL REQUIRED",
      shortDetail: "Recent operating margins are persistently negative",
      detail: "A standard smooth-growth DCF cannot infer a credible path from recurring operating losses to stable positive NOPAT. Use an explicit revenue, gross-margin, operating-expense, financing, and dilution plan with probability-weighted scenarios before applying a terminal value.",
    };
  }

  if ((data.metrics.capexPercentRevenue ?? 0) > 100 && data.metrics.ebitMargin <= 0) {
    return {
      supported: false,
      code: "capital-intensive-turnaround",
      label: "OPERATING PLAN REQUIRED",
      shortDetail: "Current capex exceeds revenue while operating profit is negative",
      detail: "A smooth margin and capex fade is not a defensible automatic forecast for this capital-intensive growth company. Build explicit capacity, utilization, pricing, power, financing, depreciation, capex, and dilution scenarios before applying either terminal method.",
    };
  }

  const reportingCurrency = data.denomination?.issuerReportingCurrency;
  const displayCurrency = data.denomination?.financialDisplayCurrency;
  if (reportingCurrency && displayCurrency && reportingCurrency !== "Unverified" && reportingCurrency !== displayCurrency && data.denomination?.fxRate == null) {
    return {
      supported: false,
      code: "currency-unverified",
      label: "CURRENCY NORMALIZATION REQUIRED",
      shortDetail: "The issuer and valuation currencies have not been reconciled",
      detail: `The issuer reports in ${reportingCurrency}, while the model displays ${displayCurrency}. The provider did not supply a verified translation rate and date. Cash flows, WACC, terminal growth, debt, cash, and shares must be aligned before calculating a per-share value.`,
    };
  }

  return { supported: true };
}
