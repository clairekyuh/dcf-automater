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

function filingText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function customerConcentration(text: string) {
  const disclosures: Array<{ customer: string; revenuePercent: number; disclosure: string }> = [];
  const sentences = text.match(/[^.]{0,240}(?:accounted for|accounting for|represented|comprised|constituted)[^.]{0,240}(?:revenue|revenues|sales)[^.]{0,80}\./gi) || [];
  for (const sentence of sentences.slice(0, 30)) {
    if (!/(?:total|net)\s+(?:company\s+)?(?:revenue|revenues|sales)|(?:our|company's|company’s)\s+(?:revenue|revenues|sales)/i.test(sentence)) continue;
    const percentages = Array.from(sentence.matchAll(/(\d{1,2}(?:\.\d+)?)\s*%/g)).map((match) => Number(match[1])).filter((value) => value > 0 && value <= 100);
    if (!percentages.length) continue;
    const explicitLabels = Array.from(sentence.matchAll(/(?:Customer\s+[A-Z0-9]+|Walmart(?:\/Sam'?s Club)?)/g)).map((match) => match[0].trim());
    const namedBeforeVerb = sentence.match(/([A-Z][A-Za-z&'.-]+(?:\s+[A-Z][A-Za-z&'.-]+){0,3})\s+(?:accounted for|represented|comprised|constituted)/)?.[1]?.trim();
    const namedAfterSales = sentence.match(/(?:sales to|revenue from)\s+([A-Z][A-Za-z&'.-]+(?:\s+[A-Z][A-Za-z&'.-]+){0,3})/i)?.[1]?.trim();
    const customerLabels = [...explicitLabels, namedAfterSales, namedBeforeVerb]
      .filter((label): label is string => Boolean(label))
      .filter((label) => !/^(For|The|Our|Company|One Customer|Two Customers|Three Customers|Net Sales|Total Revenue|Fiscal|During|As Of)$/i.test(label));
    const reportedPercentages = customerLabels.length > 1 ? percentages.slice(0, customerLabels.length) : percentages.slice(0, 1);
    reportedPercentages.forEach((revenuePercent, index) => {
      const customer = customerLabels[index] || customerLabels[0] || (percentages.length > 1 ? `Disclosed customer ${index + 1}` : "Disclosed customer");
      const key = `${customer}-${revenuePercent}`;
      if (!disclosures.some((item) => `${item.customer}-${item.revenuePercent}` === key)) {
        disclosures.push({ customer, revenuePercent, disclosure: "Latest annual filing" });
      }
    });
  }
  const noMajorCustomer = /no (?:single |individual |other )?customer[^.]{0,100}(?:10|ten)\s*%[^.]{0,100}(?:revenue|revenues|sales)/i.test(text)
    || /largest customer[^.]{0,100}(?:less than|below)\s*(?:10|ten)\s*%/i.test(text);
  return { disclosures: disclosures.slice(0, 6), noMajorCustomer };
}

function supplyChainSignals(text: string) {
  const signals: Array<{ level: "high" | "medium" | "low"; title: string; detail: string }> = [];
  if (/sole[- ]source|single[- ]source|single supplier|limited number of suppliers/i.test(text)) {
    signals.push({ level: "high", title: "Concentrated sourcing", detail: "The annual filing discusses sole-source, single-source, or limited-supplier dependencies. A disruption could be difficult to replace quickly." });
  }
  if (/contract manufacturers|third-party manufacturers|outsourc(?:e|ed|ing)[^.]{0,80}manufactur|semiconductor foundr/i.test(text)) {
    signals.push({ level: "medium", title: "External manufacturing", detail: "The filing indicates reliance on contract manufacturers, third-party manufacturing, or semiconductor foundries, reducing direct control over capacity and delivery." });
  }
  if (/third-party cloud|cloud service provider|data center provider|hosting provider/i.test(text)) {
    signals.push({ level: "medium", title: "Infrastructure-provider dependence", detail: "The filing discusses third-party cloud, hosting, or data-center providers. Outages, price increases, or capacity constraints could affect service delivery." });
  }
  if (/(?:supplier|manufactur|foundr|production)[^.]{0,160}(?:Taiwan|China|People's Republic of China)|(?:Taiwan|China|People's Republic of China)[^.]{0,160}(?:supplier|manufactur|foundr|production)/i.test(text)) {
    signals.push({ level: "medium", title: "Geographic supply exposure", detail: "The filing connects manufacturing or supplier activity with China or Taiwan, which can increase trade, logistics, and geopolitical exposure." });
  }
  if (/raw material shortages|component shortages|supply chain disruption|supply constraints/i.test(text)) {
    signals.push({ level: "medium", title: "Shortage and disruption exposure", detail: "The filing identifies raw-material, component, or broader supply-chain disruption as a business risk." });
  }
  return signals.slice(0, 5);
}

function defaultRiskScreen(values: {
  debtToRevenue: number | null;
  netDebtToEbitda: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  fcfToDebt: number | null;
  ebitda: number;
  freeCashFlow: number;
}) {
  let points = 0;
  const drivers: string[] = [];
  const add = (condition: boolean, score: number, driver: string) => { if (condition) { points += score; drivers.push(driver); } };
  if (values.debtToRevenue !== null) {
    add(values.debtToRevenue > 1.5, 2, "Debt is high relative to revenue.");
    add(values.debtToRevenue > .75 && values.debtToRevenue <= 1.5, 1, "Debt is elevated relative to revenue.");
  }
  if (values.netDebtToEbitda !== null) {
    add(values.netDebtToEbitda > 4, 2, "Net debt exceeds four times EBITDA.");
    add(values.netDebtToEbitda > 2.5 && values.netDebtToEbitda <= 4, 1, "Net debt is elevated relative to EBITDA.");
  }
  if (values.currentRatio !== null) {
    add(values.currentRatio < 1, 2, "Current liabilities exceed current assets.");
    add(values.currentRatio >= 1 && values.currentRatio < 1.5, 1, "Short-term liquidity is limited.");
  }
  if (values.interestCoverage !== null) {
    add(values.interestCoverage < 1.5, 2, "Operating income provides weak interest coverage.");
    add(values.interestCoverage >= 1.5 && values.interestCoverage < 3, 1, "Interest coverage has a limited cushion.");
  }
  if (values.fcfToDebt !== null) {
    add(values.fcfToDebt < 0, 2, "Free cash flow is negative relative to debt.");
    add(values.fcfToDebt >= 0 && values.fcfToDebt < .1, 1, "Free cash flow covers less than 10% of funded debt.");
  }
  add(values.ebitda <= 0, 2, "EBITDA is non-positive, weakening debt-service capacity.");
  add(values.freeCashFlow < 0 && (values.fcfToDebt === null || values.fcfToDebt >= 0), 1, "Free cash flow is negative.");
  return {
    level: points >= 6 ? "high" : points >= 3 ? "moderate" : "low",
    points,
    drivers: drivers.length ? drivers : ["The available leverage, liquidity, coverage, and cash-flow ratios do not show an obvious near-term default warning."],
  };
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
    const secMetrics = {
      currentAssets: fact("us-gaap", ["AssetsCurrent"], "USD"),
      currentLiabilities: fact("us-gaap", ["LiabilitiesCurrent"], "USD"),
      totalAssets: fact("us-gaap", ["Assets"], "USD"),
      totalLiabilities: fact("us-gaap", ["Liabilities"], "USD"),
      retainedEarnings: fact("us-gaap", ["RetainedEarningsAccumulatedDeficit"], "USD"),
      costOfRevenue: fact("us-gaap", ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization"], "USD"),
      interestExpense: fact("us-gaap", ["InterestExpenseNonOperating", "InterestExpense"], "USD"),
    };
    let filing: null | {
      form: string;
      filingDate: string;
      reportDate: string;
      url: string;
      customerConcentration: ReturnType<typeof customerConcentration>;
      supplyChainSignals: ReturnType<typeof supplyChainSignals>;
    } = null;
    try {
      const submissionsResponse = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers, next: { revalidate: 86400 } });
      if (submissionsResponse.ok) {
        const submissions = await submissionsResponse.json();
        const recent = submissions.filings?.recent;
        const filingIndex = (recent?.form as string[] | undefined)?.findIndex((form) => ["10-K", "20-F"].includes(form)) ?? -1;
        if (filingIndex >= 0) {
          const accession = String(recent.accessionNumber[filingIndex]);
          const primaryDocument = String(recent.primaryDocument[filingIndex]);
          const accessionPath = accession.replace(/-/g, "");
          const cikPath = String(match.cik_str);
          const primaryUrl = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${primaryDocument}`;
          const documentUrl = primaryDocument.toLowerCase().endsWith(".pdf")
            ? `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${accession}.txt`
            : primaryUrl;
          const filingResponse = await fetch(documentUrl, { headers, next: { revalidate: 86400 } });
          if (filingResponse.ok) {
            const text = filingText(await filingResponse.text());
            filing = {
              form: recent.form[filingIndex],
              filingDate: recent.filingDate[filingIndex],
              reportDate: recent.reportDate[filingIndex],
              url: primaryUrl,
              customerConcentration: customerConcentration(text),
              supplyChainSignals: supplyChainSignals(text),
            };
          }
        }
      }
    } catch {
      // Filing text is supplemental; structured facts should still be returned.
    }
    return {
      cash: cash === undefined ? undefined : cash / 1_000_000,
      // Only replace provider debt when both sides of the SEC debt bridge are present.
      debt: currentDebt !== undefined && noncurrentDebt !== undefined ? (currentDebt + noncurrentDebt) / 1_000_000 : undefined,
      shares: shares === undefined ? undefined : shares / 1_000_000,
      metrics: Object.fromEntries(Object.entries(secMetrics).map(([key, value]) => [key, value === undefined ? undefined : value / 1_000_000])),
      filing,
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
      const cogs = Math.abs(millions(inc.costOfRevenue || inc.costofGoodsAndServicesSold));
      const grossProfit = millions(inc.grossProfit) || (revenue - cogs);
      const interestExpense = Math.abs(millions(inc.interestExpense));
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
        cogs,
        grossProfit,
        grossMargin: revenue ? (grossProfit / revenue) * 100 : 0,
        interestExpense,
        cash: millions(bal.cashAndCashEquivalentsAtCarryingValue || bal.cashAndShortTermInvestments),
        debt: fundedDebt(bal),
        currentAssets: millions(bal.totalCurrentAssets),
        currentLiabilities: millions(bal.totalCurrentLiabilities),
        totalAssets: millions(bal.totalAssets),
        totalLiabilities: millions(bal.totalLiabilities),
        retainedEarnings: millions(bal.retainedEarnings),
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
    const secMetric = (key: string) => n(sec?.metrics?.[key]);
    if (!latest.currentAssets) latest.currentAssets = secMetric("currentAssets");
    if (!latest.currentLiabilities) latest.currentLiabilities = secMetric("currentLiabilities");
    if (!latest.totalAssets) latest.totalAssets = secMetric("totalAssets");
    if (!latest.totalLiabilities) latest.totalLiabilities = secMetric("totalLiabilities");
    if (!latest.retainedEarnings) latest.retainedEarnings = secMetric("retainedEarnings");
    if (!latest.cogs) latest.cogs = secMetric("costOfRevenue");
    if (!latest.interestExpense) latest.interestExpense = secMetric("interestExpense");
    const revenueGrowth = growthRate(historical.map((row) => row.revenue));
    // Keep the provider share count editable. A single SEC fact can represent only
    // one voting class and would understate dilution for multi-class companies.
    const shares = millions(overview.SharesOutstanding);
    const marketCap = millions(overview.MarketCapitalization);
    const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
    const ebitda = latest.ebit + latest.depreciation;
    const netDebt = latest.debt - latest.cash;
    const debtToRevenue = ratio(latest.debt, latest.revenue);
    const netDebtToEbitda = ebitda > 0 ? ratio(netDebt, ebitda) : null;
    const currentRatio = ratio(latest.currentAssets, latest.currentLiabilities);
    const interestCoverage = ratio(latest.ebit, latest.interestExpense);
    const fcfToDebt = ratio(latest.freeCashFlow, latest.debt);
    const defaultRisk = defaultRiskScreen({ debtToRevenue, netDebtToEbitda, currentRatio, interestCoverage, fcfToDebt, ebitda, freeCashFlow: latest.freeCashFlow });
    const altmanApplicable = /manufactur|industrial|automotive|aerospace|semiconductor|hardware|consumer durables/i.test(`${overview.Sector} ${overview.Industry}`)
      && !/bank|insurance|financial|reit/i.test(`${overview.Sector} ${overview.Industry}`)
      && latest.totalAssets > 0 && latest.totalLiabilities > 0;
    const workingCapital = latest.currentAssets - latest.currentLiabilities;
    const altmanZ = altmanApplicable
      ? 1.2 * workingCapital / latest.totalAssets
        + 1.4 * latest.retainedEarnings / latest.totalAssets
        + 3.3 * latest.ebit / latest.totalAssets
        + .6 * marketCap / latest.totalLiabilities
        + latest.revenue / latest.totalAssets
      : null;
    const customerData = sec?.filing?.customerConcentration || { disclosures: [], noMajorCustomer: false };
    const maxCustomerPercent = customerData.disclosures.length ? Math.max(...customerData.disclosures.map((item) => item.revenuePercent)) : null;
    const supplySignals = [...(sec?.filing?.supplyChainSignals || [])];
    if (maxCustomerPercent !== null) {
      supplySignals.unshift({
        level: maxCustomerPercent >= 20 ? "high" as const : "medium" as const,
        title: "Customer concentration",
        detail: `The latest filing discloses at least one customer representing ${maxCustomerPercent}% of revenue. Losing or repricing that relationship could materially affect sales and cash flow.`,
      });
    }
    if (latest.capexPercentRevenue > 10) {
      supplySignals.push({ level: latest.capexPercentRevenue > 25 ? "high" as const : "medium" as const, title: "Capital-intensive capacity", detail: `Capital spending equals ${latest.capexPercentRevenue.toFixed(1)}% of revenue, increasing execution, utilization, and financing exposure in the operating supply chain.` });
    }
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
      businessAnalysis: {
        financials: {
          revenue: latest.revenue,
          cogs: latest.cogs,
          cogsPercentRevenue: latest.revenue ? latest.cogs / latest.revenue * 100 : null,
          grossProfit: latest.grossProfit || latest.revenue - latest.cogs,
          grossMargin: latest.revenue ? (latest.grossProfit || latest.revenue - latest.cogs) / latest.revenue * 100 : null,
          operatingCashFlow: latest.operatingCashFlow,
          freeCashFlow: latest.freeCashFlow,
          currentAssets: latest.currentAssets,
          currentLiabilities: latest.currentLiabilities,
          interestExpense: latest.interestExpense,
          ebitda,
          netDebt,
        },
        customerConcentration: {
          disclosures: customerData.disclosures,
          noMajorCustomer: customerData.noMajorCustomer,
          disclosureThreshold: 10,
        },
        supplyChain: {
          signals: supplySignals.slice(0, 6),
          filingReviewed: Boolean(sec?.filing),
        },
        defaultRisk: {
          ...defaultRisk,
          ratios: { debtToRevenue, netDebtToEbitda, currentRatio, interestCoverage, fcfToDebt },
          altmanZ,
          altmanZone: altmanZ === null ? null : altmanZ < 1.81 ? "distress" : altmanZ > 2.99 ? "lower-risk" : "gray",
          altmanApplicable,
          methodology: "Automated historical screen using leverage, liquidity, interest coverage, free-cash-flow coverage, and the original Altman Z-score where broadly applicable. It is not a credit rating or a probability of default.",
        },
        filing: sec?.filing ? { form: sec.filing.form, filingDate: sec.filing.filingDate, reportDate: sec.filing.reportDate, url: sec.filing.url } : null,
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
