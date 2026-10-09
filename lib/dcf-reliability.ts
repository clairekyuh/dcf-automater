import type { CompanyData } from "./company-data";
import { assessStandardDcfApplicability } from "./dcf-applicability";
import type { DcfModel } from "./dcf-engine";

type DcfResultStatus = {
  valid: boolean;
  invalidReason: string | null;
};

export type DcfReliability = {
  level: "clear" | "caution" | "blocked";
  title: string;
  summary: string;
  reasons: Array<{ label: string; detail: string }>;
};

export function assessDcfReliability(
  data: CompanyData,
  model: DcfModel,
  perpetuity: DcfResultStatus,
  multiple: DcfResultStatus,
): DcfReliability {
  const applicability = assessStandardDcfApplicability(data);
  if (!applicability.supported) {
    return {
      level: "blocked",
      title: "WARNING",
      summary: "This automated DCF is not suitable for this company.",
      reasons: [{ label: applicability.label, detail: applicability.shortDetail }],
    };
  }

  const invalidReasons = [...new Set(
    [perpetuity.invalidReason, multiple.invalidReason].filter((reason): reason is string => Boolean(reason)),
  )];

  if (!perpetuity.valid && !multiple.valid) {
    return {
      level: "blocked",
      title: "WARNING",
      summary: "This DCF cannot be calculated.",
      reasons: invalidReasons.map((detail) => ({ label: "INVALID INPUTS", detail })),
    };
  }

  const reasons: DcfReliability["reasons"] = [];
  const latestMargin = data.metrics.ebitMargin;
  const finalMargin = model.forecastDrivers.at(-1)?.ebitMargin;
  const classification = `${data.company.sector || ""} ${data.company.industry || ""}`;

  if (/oil|gas|petroleum|metal mining|gold|copper|commodity/i.test(classification)) {
    reasons.push({
      label: "CYCLICAL CASH FLOW",
      detail: "Normalize commodity prices, margins, reserves, and capex",
    });
  }

  if (!perpetuity.valid || !multiple.valid) {
    reasons.push({ label: "METHOD UNAVAILABLE", detail: invalidReasons.join(" ") });
  }

  if (Number.isFinite(latestMargin) && latestMargin < 0) {
    reasons.push({
      label: "NEGATIVE EBIT MARGIN",
      detail: `${latestMargin.toFixed(1)}%`,
    });
    if (finalMargin !== undefined && finalMargin > 0) {
      reasons.push({
        label: "TURNAROUND ASSUMED",
        detail: `${finalMargin.toFixed(1)}% EBIT margin by the final year`,
      });
    }
  }

  const leverage = data.metrics.debt / Math.max(data.metrics.revenue, 1);
  if (latestMargin < 0 && (data.metrics.capexPercentRevenue > 25 || leverage > 1)) {
    reasons.push({
      label: "FUNDING RISK",
      detail: data.metrics.capexPercentRevenue > 25
        ? `${data.metrics.capexPercentRevenue.toFixed(1)}% capex to revenue with negative EBIT`
        : `${(leverage * 100).toFixed(0)}% debt to revenue with negative EBIT`,
    });
  }

  if (data.revenueData && data.revenueData.quality !== "complete") {
    reasons.push({
      label: "REVENUE DATA ISSUE",
      detail: `${data.revenueData.quality} annual history`,
    });
  }

  if (/not a verified fully diluted count/i.test(data.market.sharesSource || "")) {
    reasons.push({
      label: "SHARE COUNT UNVERIFIED",
      detail: "Per-share value may change after dilution is verified",
    });
  }

  if (!data.forecast) {
    reasons.push({ label: "NO REVENUE FORECAST", detail: "automatic estimates used" });
  }

  if (data.historical.length < 3) {
    reasons.push({
      label: "LIMITED HISTORY",
      detail: `${data.historical.length} annual period${data.historical.length === 1 ? "" : "s"} available`,
    });
  }

  if ((data.metrics.preferredInterest ?? 0) < 0) {
    reasons.push({
      label: "DATA ISSUE",
      detail: "non-equity claims set to $0",
    });
  }

  if (!reasons.length) {
    return {
      level: "clear",
      title: "",
      summary: "",
      reasons: [],
    };
  }

  return {
    level: "caution",
    title: "WARNING",
    summary: "This DCF may be unreliable.",
    reasons: reasons.slice(0, 3),
  };
}
