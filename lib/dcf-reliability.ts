import type { CompanyData } from "./company-data";
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

  if (!perpetuity.valid || !multiple.valid) {
    reasons.push({ label: "METHOD UNAVAILABLE", detail: invalidReasons.join(" ") });
  }

  if (Number.isFinite(latestMargin) && latestMargin < 0) {
    reasons.push({
      label: "NEGATIVE EBIT MARGIN",
      detail: `${latestMargin.toFixed(1)}%. The company is currently loss-making.`,
    });
    if (finalMargin !== undefined && finalMargin > 0) {
      reasons.push({
        label: "TURNAROUND ASSUMED",
        detail: `${finalMargin.toFixed(1)}% EBIT margin in the final year. Not analyst consensus.`,
      });
    }
  }

  if (!data.forecast) {
    reasons.push({ label: "NO REVENUE FORECAST", detail: "All forecast years are automatic estimates." });
  }

  if (data.historical.length < 3) {
    reasons.push({
      label: "LIMITED HISTORY",
      detail: `Only ${data.historical.length} annual period${data.historical.length === 1 ? " is" : "s are"} available.`,
    });
  }

  if ((data.metrics.preferredInterest ?? 0) < 0) {
    reasons.push({
      label: "DATA ISSUE",
      detail: "Non-equity claims were set to $0 because the reported value was negative.",
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
