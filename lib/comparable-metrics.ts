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

/**
 * Returns descriptive statistics for every reported multiple, but only selects
 * an automatic exit multiple when at least two positive, non-extreme,
 * operationally relevant observations are available and their spread is not
 * excessive. A two-company sample is explicitly labeled as limited rather
 * than discarded. Raw signed values remain visible in the comps table.
 */
export function peerExitBenchmark(peers: ReadonlyArray<ExitPeer>) {
  const values = peers
    .map((peer) => peer.evToEbitdaLtm)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const eligible = peers
    .filter((peer) => peer.peerFit !== "adjacent")
    .filter((peer) => {
      const value = peer.evToEbitdaLtm;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return false;
      if (peer.evToEbitdaLtmQuality && peer.evToEbitdaLtmQuality !== "normal") return false;
      return value <= 100;
    })
    .map((peer) => peer.evToEbitdaLtm!)
    .sort((a, b) => a - b);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const eligibleAverage = eligible.length ? eligible.reduce((sum, value) => sum + value, 0) / eligible.length : null;
  const dispersion = eligible.length >= 2 && eligible[0] > 0 ? eligible.at(-1)! / eligible[0] : null;
  const maximumDispersion = eligible.length === 2 ? 2.5 : 3;
  const sufficient = eligible.length >= 2 && dispersion !== null && dispersion <= maximumDispersion;
  const selected = sufficient ? median(eligible) : null;
  const reason = eligible.length < 2
    ? `Only ${eligible.length} usable positive peer multiple${eligible.length === 1 ? " is" : "s are"} available; at least 2 are required for an automatic exit multiple.`
    : dispersion !== null && dispersion > maximumDispersion
      ? `Usable peer multiples span ${dispersion.toFixed(1)}× from low to high, which is too dispersed for an automatic exit multiple.`
      : eligible.length === 2
        ? "Selected as the midpoint of 2 usable peer EV / EBITDA LTM multiples. The limited sample should be verified or expanded."
        : "Selected as the median of positive, non-extreme, operationally relevant peer EV / EBITDA LTM multiples.";
  return {
    values,
    count: values.length,
    average,
    median: median(values),
    eligibleValues: eligible,
    eligibleCount: eligible.length,
    eligibleAverage,
    eligibleMedian: median(eligible),
    dispersion,
    sufficient,
    selected,
    reason,
  };
}
