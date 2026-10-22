/** Keep every finite signed result; only missing inputs and division by zero are undefined. */
export function signedMultiple(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

export function profitMultiple(enterpriseValue: number | null, profit: number | null, revenue: number | null) {
  const value = signedMultiple(enterpriseValue, profit);
  if (value === null) return { value, quality: profit === 0 ? "not-meaningful" as const : "unavailable" as const };
  const extreme = Math.abs(value) > 100 || (revenue !== null && revenue !== 0 && profit !== null && Math.abs(profit / revenue) < .02);
  return { value, quality: profit! < 0 ? "not-meaningful" as const : extreme ? "extreme" as const : "normal" as const };
}

type ExitPeer = {
  evToEbitdaLtm?: number | null;
  evToEbitdaLtmQuality?: "normal" | "extreme" | "not-meaningful" | "unavailable";
  peerFit?: "focus" | "direct" | "close" | "adjacent";
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
};

/** Every finite reported LTM EV / EBITDA value participates in the statistics. */
export function peerExitBenchmark(peers: ReadonlyArray<ExitPeer>) {
  const values = peers
    .map((peer) => peer.evToEbitdaLtm)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const reportedMedian = median(values);
  const dispersion = values.length >= 2 && values[0] > 0 ? values.at(-1)! / values[0] : null;
  const selected = reportedMedian !== null && reportedMedian > 0 ? reportedMedian : null;
  const sufficient = selected !== null;
  const reason = !values.length
    ? "No peer has a numerical LTM EV / EBITDA value."
    : selected === null
      ? `The full peer median is ${reportedMedian?.toFixed(1)}×, which cannot be applied as a positive terminal EBITDA multiple.`
      : values.length === 1
        ? "Uses the only numerical peer LTM EV / EBITDA value. Verify the assumption before relying on it."
        : values.length === 2
          ? "Uses the midpoint of both numerical peer LTM EV / EBITDA values."
          : "Uses the median of all numerical peer LTM EV / EBITDA values.";
  return {
    values,
    count: values.length,
    average,
    median: reportedMedian,
    eligibleValues: values,
    eligibleCount: values.length,
    eligibleAverage: average,
    eligibleMedian: reportedMedian,
    dispersion,
    sufficient,
    selected,
    reason,
  };
}
