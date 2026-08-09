export type MarketPricePoint = { date: string; close: number };

export type MarketBetaEstimate = {
  rawBeta: number;
  beta: number;
  observations: number;
  startMonth: string;
  endMonth: string;
};

function monthNumber(month: string) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value;
}

function monthEndPrices(points: MarketPricePoint[]) {
  const prices = new Map<string, MarketPricePoint>();
  for (const point of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!Number.isFinite(point.close) || point.close <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)) continue;
    prices.set(point.date.slice(0, 7), point);
  }
  return prices;
}

/**
 * Price-only beta from matched month-end returns. Returns larger than 60% are
 * excluded because the free close series is not guaranteed to be split
 * adjusted. The result is a transparent starting estimate, not a substitute
 * for a fully adjusted institutional return series.
 */
export function estimateMarketBeta(
  stockPoints: MarketPricePoint[],
  marketPoints: MarketPricePoint[],
  maximumObservations = 60,
): MarketBetaEstimate | null {
  const stock = monthEndPrices(stockPoints);
  const market = monthEndPrices(marketPoints);
  const commonMonths = Array.from(stock.keys())
    .filter((month) => market.has(month))
    .sort()
    .slice(-(maximumObservations + 1));
  const returns: Array<{ month: string; stock: number; market: number }> = [];

  for (let index = 1; index < commonMonths.length; index += 1) {
    const previousMonth = commonMonths[index - 1];
    const currentMonth = commonMonths[index];
    if (monthNumber(currentMonth) - monthNumber(previousMonth) !== 1) continue;
    const stockReturn = (stock.get(currentMonth)!.close / stock.get(previousMonth)!.close) - 1;
    const marketReturn = (market.get(currentMonth)!.close / market.get(previousMonth)!.close) - 1;
    if (!Number.isFinite(stockReturn) || !Number.isFinite(marketReturn)) continue;
    if (Math.abs(stockReturn) > .6 || Math.abs(marketReturn) > .6) continue;
    returns.push({ month: currentMonth, stock: stockReturn, market: marketReturn });
  }

  if (returns.length < 24) return null;
  const stockMean = returns.reduce((sum, item) => sum + item.stock, 0) / returns.length;
  const marketMean = returns.reduce((sum, item) => sum + item.market, 0) / returns.length;
  const covariance = returns.reduce((sum, item) => sum + (item.stock - stockMean) * (item.market - marketMean), 0);
  const marketVariance = returns.reduce((sum, item) => sum + (item.market - marketMean) ** 2, 0);
  if (marketVariance <= 0) return null;
  const rawBeta = covariance / marketVariance;
  if (!Number.isFinite(rawBeta)) return null;

  // A Blume-style adjustment reduces sampling noise and recognizes that
  // equity betas tend to move toward the market average over time. Preserve
  // the raw regression result so the API can disclose both values.
  const beta = (2 / 3) * rawBeta + (1 / 3);

  return {
    rawBeta,
    beta,
    observations: returns.length,
    startMonth: returns[0].month,
    endMonth: returns.at(-1)!.month,
  };
}
