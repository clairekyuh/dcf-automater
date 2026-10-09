import { isStandardDcfUnsupported } from "@/lib/dcf-engine";

type DcfApplicabilityInput = {
  company: { sector?: string; industry?: string; description?: string };
  metrics: { revenue: number; ebitMargin: number; cash: number };
};

export type DcfApplicability =
  | { supported: true }
  | {
    supported: false;
    code: "financial-institution" | "reit" | "pipeline-biotech" | "digital-asset-treasury";
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

  return { supported: true };
}
