export function betaCoveragePremium(betaSource: string | undefined, targetWacc: number, baseWacc: number) {
  if (!betaSource || !/fallback|insufficient/i.test(betaSource)) return 0;
  if (![targetWacc, baseWacc].every(Number.isFinite)) return 0;
  return Math.round(Math.max(0, targetWacc - baseWacc) * 1_000) / 1_000;
}

type ShareCountInputs = {
  country?: string | null;
  secDilutedShares?: number | null;
  marketCapShares?: number | null;
  secReportDate?: string | null;
};

export function selectShareCount({ country, secDilutedShares, marketCapShares, secReportDate }: ShareCountInputs) {
  const isUnitedStates = /^(?:united states(?: of america)?|u\.?s\.?a?\.?)$/i.test(country?.trim() || "");
  const validSec = typeof secDilutedShares === "number" && Number.isFinite(secDilutedShares) && secDilutedShares > 0;
  const validMarket = typeof marketCapShares === "number" && Number.isFinite(marketCapShares) && marketCapShares > 0;

  if (validSec && isUnitedStates) {
    return {
      shares: secDilutedShares,
      source: `Latest annual SEC weighted-average diluted shares (${secReportDate || "report date unavailable"}); update for post-filing issuance or repurchases`,
    };
  }
  if (validMarket) {
    const foreignNote = !isUnitedStates
      ? " Used to keep the quoted share price and share units consistent because an ADR/local-share conversion ratio was not verified."
      : "";
    return {
      shares: marketCapShares,
      source: `Market capitalization ÷ latest price proxy; not a verified fully diluted count.${foreignNote}`,
    };
  }
  if (validSec) {
    return {
      shares: secDilutedShares,
      source: `SEC weighted-average diluted shares (${secReportDate || "report date unavailable"}); the quoted security's ADR/local-share conversion could not be verified`,
    };
  }
  return { shares: 1, source: "No reliable share count was available; replace the 1M placeholder before using per-share results" };
}
