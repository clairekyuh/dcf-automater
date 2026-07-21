import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API = "https://www.alphavantage.co/query";

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const millions = (value: unknown) => n(value) / 1_000_000;

const metric = (value: unknown, scale = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * scale : null;
};

const median = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
};

type Statement = Record<string, string>;

function comparableFromOverview(overview: Record<string, unknown>) {
  return {
    symbol: String(overview.Symbol || ""),
    name: String(overview.Name || overview.Symbol || "Unknown company"),
    description: String(overview.Description || ""),
    sector: String(overview.Sector || "Unclassified"),
    industry: String(overview.Industry || "Unclassified"),
    marketCap: metric(overview.MarketCapitalization, 1 / 1_000_000),
    revenueGrowth: metric(overview.QuarterlyRevenueGrowthYOY, 100),
    operatingMargin: metric(overview.OperatingMarginTTM, 100),
    evToRevenue: metric(overview.EVToRevenue),
    evToEbitda: metric(overview.EVToEBITDA),
    pe: metric(overview.PERatio),
  };
}

function peerSymbols(symbol: string, sector: string, industry: string, name: string) {
  const text = `${symbol} ${sector} ${industry} ${name}`;
  const exact: Record<string, string[]> = {
    SNPS: ["CDNS", "ADSK", "PTC"],
    CDNS: ["SNPS", "ADSK", "PTC"],
    CRWV: ["MSFT", "ORCL", "AMZN"],
    IBM: ["ORCL", "ACN", "MSFT"],
    AAPL: ["MSFT", "GOOGL", "SONY"],
    NVDA: ["AMD", "AVGO", "INTC"],
    TSLA: ["GM", "F", "TM"],
  };
  if (exact[symbol]) return exact[symbol];

  const groups = [
    { match: /electronic design automation|engineering.*software/i, symbols: ["SNPS", "CDNS", "ADSK", "PTC"] },
    { match: /semiconductor/i, symbols: ["NVDA", "AMD", "AVGO", "INTC"] },
    { match: /software|cloud|information technology|internet/i, symbols: ["MSFT", "ORCL", "CRM", "NOW"] },
    { match: /bank/i, symbols: ["JPM", "BAC", "WFC", "C"] },
    { match: /insurance/i, symbols: ["CB", "PGR", "ALL", "TRV"] },
    { match: /biotech/i, symbols: ["AMGN", "GILD", "REGN", "VRTX"] },
    { match: /pharma|health/i, symbols: ["MRK", "PFE", "ABBV", "BMY"] },
    { match: /automotive|auto manufacturer/i, symbols: ["GM", "F", "TM", "HMC"] },
    { match: /oil|gas|energy/i, symbols: ["XOM", "CVX", "COP", "EOG"] },
    { match: /utility/i, symbols: ["NEE", "DUK", "SO", "AEP"] },
    { match: /telecom/i, symbols: ["VZ", "T", "TMUS", "CHTR"] },
    { match: /retail/i, symbols: ["WMT", "COST", "TGT", "AMZN"] },
    { match: /aerospace|defense/i, symbols: ["RTX", "LMT", "NOC", "GD"] },
    { match: /industrial|manufactur/i, symbols: ["HON", "ETN", "MMM", "EMR"] },
  ];
  const group = groups.find((item) => item.match.test(text));
  return (group?.symbols || ["MSFT", "ORCL", "IBM", "ACN"]).filter((candidate) => candidate !== symbol).slice(0, 3);
}

async function alpha(functionName: string, symbol: string, apiKey: string) {
  const url = new URL(API);
  url.searchParams.set("function", functionName);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  // Do not cache provider errors; the normalized successful response is cached below.
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Financial-data request failed (${response.status}).`);
  const data = await response.json();
  if (data.Note || data.Information) {
    throw new Error("The financial-data provider's daily limit has been reached. Try again after the limit resets or use a higher-limit API key.");
  }
  if (data["Error Message"]) throw new Error("Ticker not found. Check the symbol and try again.");
  return data;
}

function nearest(report: Statement[] | undefined, fiscalDate: string) {
  if (!report?.length) return {} as Statement;
  return report.find((item) => item.fiscalDateEnding === fiscalDate) || report[0];
}

function growthRate(values: number[]) {
  const valid = values.filter((value) => value > 0);
  if (valid.length < 2) return 0;
  const newest = valid[0];
  const oldest = valid[valid.length - 1];
  return (Math.pow(newest / oldest, 1 / (valid.length - 1)) - 1) * 100;
}

function fundedDebt(balance: Statement) {
  const current = n(balance.currentDebt) || n(balance.currentLongTermDebt) || n(balance.longTermDebtCurrent);
  const noncurrent = n(balance.longTermDebtNoncurrent) || n(balance.longTermDebt);
  const funded = current + noncurrent;
  return millions(funded || balance.shortLongTermDebtTotal || 0);
}

async function secCrossCheck(symbol: string, fiscalDate: string) {
  try {
    const headers = { "User-Agent": "DCF-Automater/1.0 github.com/clairekyuh/dcf-automater" };
    const tickerResponse = await fetch("https://www.sec.gov/files/company_tickers.json", { headers, next: { revalidate: 604800 } });
    if (!tickerResponse.ok) return null;
    const tickers = await tickerResponse.json() as Record<string, { cik_str: number; ticker: string }>;
    const match = Object.values(tickers).find((company) => company.ticker.toUpperCase() === symbol);
    if (!match) return null;
    const cik = String(match.cik_str).padStart(10, "0");
    const factsResponse = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers, next: { revalidate: 86400 } });
    if (!factsResponse.ok) return null;
    const facts = await factsResponse.json();

    const fact = (taxonomy: string, concepts: string[], unit: string, exactDate = true) => {
      for (const concept of concepts) {
        const entries = facts.facts?.[taxonomy]?.[concept]?.units?.[unit] as Array<{ end: string; val: number; form: string; filed: string }> | undefined;
        const annual = entries?.filter((entry) => ["10-K", "20-F"].includes(entry.form) && (!exactDate || entry.end === fiscalDate));
        if (annual?.length) return [...annual].sort((a, b) => b.filed.localeCompare(a.filed))[0].val;
      }
      return undefined;
    };

    const cash = fact("us-gaap", ["CashAndCashEquivalentsAtCarryingValue"], "USD");
    const currentDebt = fact("us-gaap", ["LongTermDebtCurrent", "ShortTermBorrowings"], "USD");
    const noncurrentDebt = fact("us-gaap", ["LongTermDebtNoncurrent"], "USD");
    const shares = fact("dei", ["EntityCommonStockSharesOutstanding"], "shares", false);
    return {
      cash: cash === undefined ? undefined : cash / 1_000_000,
      // Only replace provider debt when both sides of the SEC debt bridge are present.
      debt: currentDebt !== undefined && noncurrentDebt !== undefined ? (currentDebt + noncurrentDebt) / 1_000_000 : undefined,
      shares: shares === undefined ? undefined : shares / 1_000_000,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Enter a valid ticker symbol." }, { status: 400 });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || (symbol === "IBM" ? "demo" : "");
  if (!apiKey) {
    return NextResponse.json({
      error: "This deployment needs an Alpha Vantage API key. Add ALPHA_VANTAGE_API_KEY to .env.local. IBM works in demo mode.",
    }, { status: 503 });
  }

  try {
    // Pace calls so the free/demo tier's per-second limit is respected.
    const functions = ["OVERVIEW", "INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"];
    const responses = [];
    for (const functionName of functions) {
      responses.push(await alpha(functionName, symbol, apiKey));
      if (functionName !== "CASH_FLOW") await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    const [overview, income, balance, cashflow] = responses;

    if (!overview.Symbol || !income.annualReports?.length) throw new Error("No complete company data was returned for this ticker.");

    const historical = (income.annualReports as Statement[]).slice(0, 5).map((inc) => {
      const bal = nearest(balance.annualReports, inc.fiscalDateEnding);
      const cf = nearest(cashflow.annualReports, inc.fiscalDateEnding);
      const revenue = millions(inc.totalRevenue);
      // Operating income is the correct EBIT starting point for an unlevered DCF.
      // Provider "ebit" fields may include non-operating income or expense.
      const ebit = millions(inc.operatingIncome || inc.ebit);
      const capex = Math.abs(millions(cf.capitalExpenditures));
      const depreciation = millions(cf.depreciationDepletionAndAmortization || cf.depreciation);
      const operatingCashFlow = millions(cf.operatingCashflow);
      const freeCashFlow = operatingCashFlow - capex;
      return {
        year: inc.fiscalDateEnding?.slice(0, 4),
        fiscalDate: inc.fiscalDateEnding,
        revenue,
        ebit,
        ebitMargin: revenue ? (ebit / revenue) * 100 : 0,
        operatingCashFlow,
        capex,
        capexPercentRevenue: revenue ? (capex / revenue) * 100 : 0,
        depreciation,
        freeCashFlow,
        cash: millions(bal.cashAndCashEquivalentsAtCarryingValue || bal.cashAndShortTermInvestments),
        debt: fundedDebt(bal),
      };
    });

    const latest = historical[0];
    let monthlyPrices: Record<string, Record<string, string>> = {};
    try {
      // Monthly history provides 20+ years in a single free API request and keeps
      // the interactive chart light enough to render without a chart dependency.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const monthly = await alpha("TIME_SERIES_MONTHLY", symbol, apiKey);
      monthlyPrices = monthly["Monthly Time Series"] || {};
    } catch {
      // Price history is optional: financial statements should still build a DCF
      // if the free provider limit is reached on the fifth request.
    }
    const priceHistory = Object.entries(monthlyPrices)
      .map(([date, values]) => ({ date, close: n(values["4. close"]) }))
      .filter((point) => point.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    const selectedPeerSymbols = peerSymbols(symbol, overview.Sector || "", overview.Industry || "", overview.Name || "");
    const peerOverviews: Record<string, unknown>[] = [];
    for (const peerSymbol of selectedPeerSymbols) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const peerOverview = await alpha("OVERVIEW", peerSymbol, apiKey);
        if (peerOverview.Symbol) peerOverviews.push(peerOverview);
      } catch {
        // Comparable data is supplemental. Preserve the primary DCF when a peer
        // symbol is unsupported or the provider allowance ends mid-request.
      }
    }
    const peers = peerOverviews.map(comparableFromOverview);
    const industryGrowthRate = median(peers.map((peer) => peer.revenueGrowth));
    const sec = await secCrossCheck(symbol, latest.fiscalDate);
    if (sec?.cash !== undefined) latest.cash = sec.cash;
    if (sec?.debt !== undefined) latest.debt = sec.debt;
    const revenueGrowth = growthRate(historical.map((row) => row.revenue));
    // Keep the provider share count editable. A single SEC fact can represent only
    // one voting class and would understate dilution for multi-class companies.
    const shares = millions(overview.SharesOutstanding);
    const marketCap = millions(overview.MarketCapitalization);
    const usedSec = sec && (sec.cash !== undefined || sec.debt !== undefined);
    const qualityNotes = [
      "Operating income is used as EBIT; non-operating income and interest are excluded from the EBIT starting point.",
      usedSec ? "SEC company facts were used for cash and complete funded-debt components where available." : "SEC company-fact cross-check was unavailable or incomplete for this ticker.",
    ];
    if (latest.capexPercentRevenue > 50) qualityNotes.push("Latest capex is unusually high and is shown historically, but the starting forecast normalizes it rather than projecting it unchanged forever.");
    if (!priceHistory.length) qualityNotes.push("Monthly stock-price history was unavailable, so the price chart could not be populated for this request.");
    if (peers.length < selectedPeerSymbols.length) qualityNotes.push(`Comparable-company data is partial: ${peers.length} of ${selectedPeerSymbols.length} selected peers were returned before the provider allowance ended.`);
    if (industryGrowthRate !== null) qualityNotes.push("Industry growth is represented by median quarterly year-over-year revenue growth for the returned peer group; it is a near-term benchmark, not a perpetual-growth forecast.");
    if (sec?.cash === undefined) qualityNotes.push("Cash was not independently verified; check whether the provider balance includes restricted cash that is unavailable to common shareholders.");
    if (overview.Country === "USA") qualityNotes.push("The provider share count remains editable because a single SEC fact can miss multiple voting classes and dilution; check the latest filing.");

    const normalizedResponse = NextResponse.json({
      source: usedSec ? "Alpha Vantage + SEC company facts" : "Alpha Vantage",
      asOf: latest.fiscalDate,
      qualityNotes,
      company: {
        symbol: overview.Symbol,
        name: overview.Name,
        description: overview.Description,
        exchange: overview.Exchange,
        currency: overview.Currency || "USD",
        country: overview.Country,
        sector: overview.Sector || "Unclassified",
        industry: overview.Industry || "Unclassified",
      },
      market: {
        marketCap,
        shares,
        estimatedPrice: priceHistory.at(-1)?.close || (shares ? marketCap / shares : 0),
        priceDate: priceHistory.at(-1)?.date || null,
        priceBasis: priceHistory.length ? "Latest available month-end close" : "Market capitalization divided by reported shares",
        beta: n(overview.Beta),
        priceHistory,
      },
      metrics: {
        revenueGrowth,
        revenue: latest.revenue,
        ebitMargin: latest.ebitMargin,
        capexPercentRevenue: latest.capexPercentRevenue,
        daPercentRevenue: latest.revenue ? (latest.depreciation / latest.revenue) * 100 : 0,
        cash: latest.cash,
        debt: latest.debt,
        taxRate: 21,
      },
      comparison: {
        company: comparableFromOverview(overview),
        peers,
        selectedPeerSymbols,
        industryGrowthRate,
      },
      historical: historical.reverse(),
    });
    // A stale normalized response can preserve an old accounting mapping after the
    // model is corrected, so freshness is more important here than browser caching.
    normalizedResponse.headers.set("Cache-Control", "no-store");
    return normalizedResponse;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load company data." }, { status: 502 });
  }
}
