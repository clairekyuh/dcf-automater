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
      title: "WARNING: DCF UNAVAILABLE",
      summary: "The calculator cannot produce a valid DCF with the current inputs.",
      reasons: invalidReasons.map((detail) => ({ label: "INVALID VALUATION INPUTS", detail })),
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
      detail: `The latest EBIT margin is ${latestMargin.toFixed(1)}%. Current operations are loss-making on this measure.`,
    });
    if (finalMargin !== undefined && finalMargin > 0) {
      reasons.push({
        label: "UNVERIFIED TURNAROUND",
        detail: `The model assumes EBIT margin reaches ${finalMargin.toFixed(1)}% by the final forecast year. This is an editable model estimate, not analyst consensus.`,
      });
    }
  }

  if (!data.forecast) {
    reasons.push({ label: "NO VALIDATED REVENUE FORECAST", detail: "All forecast years are automatic estimates." });
  }

  if (data.historical.length < 3) {
    reasons.push({
      label: "LIMITED OPERATING HISTORY",
      detail: `Only ${data.historical.length} annual period${data.historical.length === 1 ? " is" : "s are"} available. This is too little history to judge a normal operating cycle confidently.`,
    });
  }

  if ((data.metrics.preferredInterest ?? 0) < 0) {
    reasons.push({
      label: "BALANCE-SHEET DATA ISSUE",
      detail: "Other non-equity claims were reported with a negative carrying value. The calculator uses $0, so this item must be verified manually.",
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
    title: "WARNING: DCF MAY BE UNRELIABLE",
    summary: "Do not rely on the implied value until these risks are reviewed.",
    reasons: reasons.slice(0, 4),
  };
}
