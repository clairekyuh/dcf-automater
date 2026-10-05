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
  reasons: string[];
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
      title: "DCF unavailable",
      summary: "The current inputs do not support a valid valuation.",
      reasons: invalidReasons,
    };
  }

  const reasons: string[] = [];
  const latestMargin = data.metrics.ebitMargin;
  const finalMargin = model.forecastDrivers.at(-1)?.ebitMargin;

  if (!perpetuity.valid || !multiple.valid) {
    reasons.push(`One valuation method is unavailable: ${invalidReasons.join(" ")}`);
  }

  if (Number.isFinite(latestMargin) && latestMargin < 0) {
    reasons.push(`The latest EBIT margin is ${latestMargin.toFixed(1)}%, so the business is currently loss-making on this operating measure.`);
    if (finalMargin !== undefined && finalMargin > 0) {
      reasons.push(`The model assumes EBIT margin reaches ${finalMargin.toFixed(1)}% by the final forecast year. That turnaround is an editable model estimate, not analyst consensus.`);
    }
  }

  if (!data.forecast) {
    reasons.push("No validated external revenue forecast was available. All forecast years are automatic estimates.");
  }

  if (data.historical.length < 3) {
    reasons.push(`Only ${data.historical.length} annual period${data.historical.length === 1 ? " is" : "s are"} available, which is too little history to judge a normal operating cycle confidently.`);
  }

  if ((data.metrics.preferredInterest ?? 0) < 0) {
    reasons.push("Other non-equity claims were reported with a negative carrying value. The calculator uses $0 and requires manual verification of this balance-sheet item.");
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
    title: "DCF estimate requires caution",
    summary: "Treat the result as a scenario until these items are verified.",
    reasons: reasons.slice(0, 4),
  };
}
