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
  ebitda: number | null;
  freeCashFlow: number | null;
}) {
  let points = 0;
  const drivers: string[] = [];
  const add = (condition: boolean, score: number, driver: string) => { if (condition) { points += score; drivers.push(driver); } };
  const availableChecks = [values.debtToRevenue, values.netDebtToEbitda, values.currentRatio, values.interestCoverage, values.fcfToDebt].filter((value) => value !== null).length;
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
  add(values.ebitda !== null && values.ebitda <= 0, 2, "EBITDA is non-positive, weakening debt-service capacity.");
  add(values.freeCashFlow !== null && values.freeCashFlow < 0 && (values.fcfToDebt === null || values.fcfToDebt >= 0), 1, "Free cash flow is negative.");
  if (availableChecks < 3) {
    return {
      level: "insufficient" as const,
      points,
      availableChecks,
      drivers: ["Fewer than three core solvency ratios could be calculated from the latest SEC annual facts, so the model will not label the company low risk."],
    };
  }
  return {
    level: points >= 6 ? "high" : points >= 3 ? "moderate" : "low",
    points,
    availableChecks,
    drivers: drivers.length ? drivers : ["The available leverage, liquidity, coverage, and cash-flow ratios do not show an obvious near-term default warning."],
  };
}

function filingBusinessDescription(text: string) {
  const markers = [
    { start: /\bitem\s+1[.\s:–—-]*business\b/gi, end: /\bitem\s+1a[.\s:–—-]*risk factors\b/i },
    { start: /\bitem\s+4[.\s:–—-]*information on the company\b/gi, end: /\bitem\s+4a\b/i },
  ];
  const sections: string[] = [];
  for (const marker of markers) {
    for (const match of Array.from(text.matchAll(marker.start))) {
      const remainder = text.slice((match.index || 0) + match[0].length);
      const endIndex = remainder.search(marker.end);
      if (endIndex >= 800 && endIndex <= 180_000) sections.push(remainder.slice(0, endIndex));
    }
  }
  const section = sections.sort((a, b) => b.length - a.length)[0];
  if (!section) return "";
  const sentences = section.match(/[^.!?]{35,520}[.!?]/g) || [];
  const candidates = sentences
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => !/forward-looking|table of contents|incorporated by reference|available on our website|securities and exchange commission/i.test(sentence));
  const firstBusinessSentence = candidates.findIndex((sentence) => /\b(?:we|the company)\s+(?:are|is|provide|provides|develop|develops|design|designs|manufacture|manufactures|offer|offers|sell|sells|operate|operates|deliver|delivers|create|creates)\b/i.test(sentence));
  const selected = candidates.slice(Math.max(firstBusinessSentence, 0), Math.max(firstBusinessSentence, 0) + 3);
  const description = selected.join(" ").trim();
  return description.length > 900 ? `${description.slice(0, 897).trimEnd()}…` : description;
}

function secSupplyChainStages(description: string, filing: string) {
  const text = `${description} ${filing}`;
  const profiles = [
    { match: /electronic design automation|semiconductor intellectual property|semiconductor ip/i, stages: [
      { name: "Critical inputs", detail: "Engineering talent, proprietary algorithms, semiconductor process data, and licensed technology." },
      { name: "Operations", detail: "Develops chip-design, verification, testing, or reusable semiconductor-IP products described in the filing." },
      { name: "Delivery", detail: "Software licenses, subscriptions, support, and IP agreements are delivered to chip and systems designers." },
      { name: "End customers", detail: "Semiconductor companies, systems companies, foundries, and electronics designers." },
    ] },
    { match: /semiconductor|integrated circuit|wafer|foundr/i, stages: [
      { name: "Critical inputs", detail: "Chip-design tools, intellectual property, wafers, manufacturing equipment, substrates, and specialty materials." },
      { name: "Operations", detail: "Designs or produces semiconductors and may rely on foundries, assembly providers, and test partners." },
      { name: "Distribution", detail: "Products move through direct sales, distributors, original-equipment manufacturers, and systems partners." },
      { name: "End customers", detail: "Device makers, data centers, automakers, industrial users, and consumers, depending on the filing-described product mix." },
    ] },
    { match: /cloud|software|subscription|data center|hosted service/i, stages: [
      { name: "Critical inputs", detail: "Software engineers, intellectual property, data-center capacity, cloud services, and third-party technology." },
      { name: "Operations", detail: "Develops, hosts, secures, and supports the software or computing services described in the filing." },
      { name: "Delivery", detail: "Subscriptions, consumption contracts, licenses, direct sales, and channel partners." },
      { name: "End customers", detail: "Businesses, governments, developers, or consumers identified by the company’s annual filing." },
    ] },
    { match: /automotive|automobile|motor vehicle|vehicle production/i, stages: [
      { name: "Critical inputs", detail: "Steel, aluminum, batteries, semiconductors, electronics, components, and skilled labor." },
      { name: "Operations", detail: "Vehicle engineering, assembly, quality control, logistics, and financing support." },
      { name: "Distribution", detail: "Dealers, direct sales, fleets, service centers, and financing channels." },
      { name: "End customers", detail: "Consumers, commercial fleets, rental companies, and governments." },
    ] },
    { match: /retail|restaurant|consumer product|merchandise/i, stages: [
      { name: "Critical inputs", detail: "Finished goods, ingredients, packaging, private-label manufacturing, labor, and transportation." },
      { name: "Operations", detail: "Merchandising, inventory planning, stores or fulfillment centers, marketing, and customer service." },
      { name: "Distribution", detail: "Physical stores, e-commerce, wholesalers, marketplaces, and last-mile delivery." },
      { name: "End customers", detail: "Consumers and other customer groups described in the annual filing." },
    ] },
    { match: /pharmaceutical|biotechnology|therapeutic|clinical trial/i, stages: [
      { name: "Critical inputs", detail: "Research talent, clinical data, active ingredients, biologic materials, and contract research services." },
      { name: "Operations", detail: "Discovery, clinical trials, regulatory approval, manufacturing, and quality control." },
      { name: "Distribution", detail: "Wholesalers, specialty pharmacies, hospitals, physicians, and licensing partners." },
      { name: "End customers", detail: "Patients and healthcare providers, with payment influenced by insurers and governments." },
    ] },
    { match: /industrial|manufactur|aerospace|defense contractor/i, stages: [
      { name: "Critical inputs", detail: "Raw materials, precision components, electronics, energy, suppliers, and skilled labor." },
      { name: "Operations", detail: "Engineering, fabrication, assembly, testing, maintenance, and project execution." },
      { name: "Distribution", detail: "Direct contracts, distributors, service networks, and long-term customer programs." },
      { name: "End customers", detail: "Industrial companies, transportation operators, defense agencies, infrastructure operators, and governments." },
    ] },
  ];
  return profiles.find((profile) => profile.match.test(text))?.stages || [];
}

async function secDataset(symbol: string) {
  try {
    const headers = {
      "User-Agent": "DCF-Automater clairekyuh@users.noreply.github.com",
      "Accept-Encoding": "gzip, deflate",
    };
    const tickerResponse = await fetch("https://www.sec.gov/files/company_tickers.json", { headers, next: { revalidate: 604800 } });
    if (!tickerResponse.ok) return null;
    const tickers = await tickerResponse.json() as Record<string, { cik_str: number; ticker: string }>;
    const match = Object.values(tickers).find((company) => company.ticker.toUpperCase() === symbol);
    if (!match) return null;
    const cik = String(match.cik_str).padStart(10, "0");
    const [factsResponse, submissionsResponse] = await Promise.all([
      fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers, next: { revalidate: 86400 } }),
      fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers, next: { revalidate: 86400 } }),
    ]);
    if (!factsResponse.ok || !submissionsResponse.ok) return null;
    const facts = await factsResponse.json();
    const submissions = await submissionsResponse.json();
    const recent = submissions.filings?.recent;
    const filingIndex = (recent?.form as string[] | undefined)?.findIndex((form) => ["10-K", "20-F"].includes(form)) ?? -1;
    if (filingIndex < 0) return null;
    const reportDate = String(recent.reportDate[filingIndex]);

    type SecFact = { start?: string; end: string; val: number; form: string; filed: string; fp?: string };
    const fact = (concepts: string[], unit = "USD", duration = false) => {
      for (const concept of concepts) {
        const entries = facts.facts?.["us-gaap"]?.[concept]?.units?.[unit] as SecFact[] | undefined;
        const annual = entries?.filter((entry) => {
          if (!["10-K", "20-F"].includes(entry.form) || entry.end !== reportDate) return false;
          if (!duration) return !entry.start;
          if (!entry.start) return false;
          const days = (Date.parse(entry.end) - Date.parse(entry.start)) / 86_400_000;
          return days >= 250 && days <= 400;
        });
        if (annual?.length) return [...annual].sort((a, b) => b.filed.localeCompare(a.filed))[0].val;
      }
      return undefined;
    };

    const cash = fact(["CashAndCashEquivalentsAtCarryingValue"]);
    const currentDebt = fact(["LongTermDebtAndFinanceLeaseObligationsCurrent", "LongTermDebtCurrent", "ShortTermBorrowings"]);
    const noncurrentDebt = fact(["LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebtNoncurrent"]);
    const totalDebt = fact(["LongTermDebtAndFinanceLeaseObligations", "LongTermDebt"]);
    const debt = currentDebt !== undefined || noncurrentDebt !== undefined ? (currentDebt || 0) + (noncurrentDebt || 0) : totalDebt;
    const revenue = fact(["RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "Revenues"], "USD", true);
    const operatingIncome = fact(["OperatingIncomeLoss"], "USD", true);
    const depreciation = fact(["DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment", "Depreciation"], "USD", true);
    const operatingCashFlow = fact(["NetCashProvidedByUsedInOperatingActivities"], "USD", true);
    const capex = fact(["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForAdditionsToPropertyPlantAndEquipment"], "USD", true);
    const costOfRevenue = fact(["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization"], "USD", true);
    const reportedGrossProfit = fact(["GrossProfit"], "USD", true);
    const secMetrics = {
      revenue,
      operatingIncome,
      depreciation,
      operatingCashFlow,
      capex,
      freeCashFlow: operatingCashFlow !== undefined && capex !== undefined ? operatingCashFlow - Math.abs(capex) : undefined,
      cash,
      debt,
      currentAssets: fact(["AssetsCurrent"]),
      currentLiabilities: fact(["LiabilitiesCurrent"]),
      totalAssets: fact(["Assets"]),
      totalLiabilities: fact(["Liabilities"]),
      retainedEarnings: fact(["RetainedEarningsAccumulatedDeficit"]),
      costOfRevenue,
      grossProfit: reportedGrossProfit ?? (revenue !== undefined && costOfRevenue !== undefined ? revenue - Math.abs(costOfRevenue) : undefined),
      interestExpense: fact(["InterestExpenseNonOperating", "InterestExpense"], "USD", true),
    };
    const accession = String(recent.accessionNumber[filingIndex]);
    const primaryDocument = String(recent.primaryDocument[filingIndex]);
    const accessionPath = accession.replace(/-/g, "");
    const cikPath = String(match.cik_str);
    const primaryUrl = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${primaryDocument}`;
    const documentUrl = primaryDocument.toLowerCase().endsWith(".pdf")
      ? `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${accession}.txt`
      : primaryUrl;
    let text = "";
    try {
      const filingResponse = await fetch(documentUrl, { headers, next: { revalidate: 86400 } });
      if (filingResponse.ok) text = filingText(await filingResponse.text());
    } catch {
      // Structured SEC facts remain usable if narrative filing retrieval fails.
    }
    const businessDescription = text ? filingBusinessDescription(text) : "";
    return {
      company: {
        name: String(submissions.name || facts.entityName || ""),
        industry: String(submissions.sicDescription || ""),
        description: businessDescription,
      },
      reportDate,
      metrics: Object.fromEntries(Object.entries(secMetrics).map(([key, value]) => [key, value === undefined ? undefined : value / 1_000_000])),
      filing: {
        form: String(recent.form[filingIndex]),
        filingDate: String(recent.filingDate[filingIndex]),
        reportDate,
        url: primaryUrl,
        textAvailable: Boolean(text),
        businessDescription,
        customerConcentration: text ? customerConcentration(text) : { disclosures: [], noMajorCustomer: false },
        supplyChainSignals: text ? supplyChainSignals(text) : [],
        supplyChainStages: text ? secSupplyChainStages(businessDescription, text) : [],
      },
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
    const sec = await secDataset(symbol);
    const secMetric = (key: string) => {
      const value = sec?.metrics?.[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    };
    const secCash = secMetric("cash");
    const secDebt = secMetric("debt");
    if (secCash !== null) latest.cash = secCash;
    if (secDebt !== null) latest.debt = secDebt;
    const revenueGrowth = growthRate(historical.map((row) => row.revenue));
    // Keep the provider share count editable. A single SEC fact can represent only
    // one voting class and would understate dilution for multi-class companies.
    const shares = millions(overview.SharesOutstanding);
    const marketCap = millions(overview.MarketCapitalization);
    const ratio = (numerator: number | null, denominator: number | null) => numerator !== null && denominator !== null && denominator !== 0 ? numerator / denominator : null;
    const secRevenue = secMetric("revenue");
    const secOperatingIncome = secMetric("operatingIncome");
    const secDepreciation = secMetric("depreciation");
    const secOperatingCashFlow = secMetric("operatingCashFlow");
    const secCapex = secMetric("capex");
    const secFreeCashFlow = secMetric("freeCashFlow");
    const secCurrentAssets = secMetric("currentAssets");
    const secCurrentLiabilities = secMetric("currentLiabilities");
    const secInterestExpense = secMetric("interestExpense");
    const secCogs = secMetric("costOfRevenue");
    const secGrossProfit = secMetric("grossProfit");
    const secEbitda = secOperatingIncome !== null && secDepreciation !== null ? secOperatingIncome + secDepreciation : null;
    const secNetDebt = secDebt !== null && secCash !== null ? secDebt - secCash : null;
    const debtToRevenue = ratio(secDebt, secRevenue);
    const netDebtToEbitda = secEbitda !== null && secEbitda > 0 ? ratio(secNetDebt, secEbitda) : null;
    const currentRatio = ratio(secCurrentAssets, secCurrentLiabilities);
    const interestCoverage = ratio(secOperatingIncome, secInterestExpense);
    const fcfToDebt = ratio(secFreeCashFlow, secDebt);
    const defaultRisk = defaultRiskScreen({ debtToRevenue, netDebtToEbitda, currentRatio, interestCoverage, fcfToDebt, ebitda: secEbitda, freeCashFlow: secFreeCashFlow });
    const customerData = sec?.filing.customerConcentration || { disclosures: [], noMajorCustomer: false };
    const maxCustomerPercent = customerData.disclosures.length ? Math.max(...customerData.disclosures.map((item) => item.revenuePercent)) : null;
    const supplySignals = [...(sec?.filing.supplyChainSignals || [])];
    if (maxCustomerPercent !== null) {
      supplySignals.unshift({
        level: maxCustomerPercent >= 20 ? "high" as const : "medium" as const,
        title: "Customer concentration",
        detail: `The latest filing discloses at least one customer representing ${maxCustomerPercent}% of revenue. Losing or repricing that relationship could materially affect sales and cash flow.`,
      });
    }
    const secCapexPercentRevenue = secCapex !== null && secRevenue ? Math.abs(secCapex) / secRevenue * 100 : null;
    if (secCapexPercentRevenue !== null && secCapexPercentRevenue > 10) {
      supplySignals.push({ level: secCapexPercentRevenue > 25 ? "high" as const : "medium" as const, title: "Capital-intensive capacity", detail: `SEC-reported capital spending equals ${secCapexPercentRevenue.toFixed(1)}% of revenue, increasing execution, utilization, and financing exposure in the operating supply chain.` });
    }
    const usedSec = Boolean(sec);
    const qualityNotes = [
      "Operating income is used as EBIT; non-operating income and interest are excluded from the EBIT starting point.",
      usedSec ? "The company description, operating analysis, customer concentration, COGS, and default-risk screen use only the latest SEC annual filing and SEC Company Facts." : "SEC annual data was unavailable for this ticker; the separate business-analysis page will show unavailable fields rather than substitute provider estimates.",
    ];
    if (latest.capexPercentRevenue > 50) qualityNotes.push("Latest capex is unusually high and is shown historically, but the starting forecast normalizes it rather than projecting it unchanged forever.");
    if (!priceHistory.length) qualityNotes.push("Monthly stock-price history was unavailable, so the price chart could not be populated for this request.");
    if (peers.length < selectedPeerSymbols.length) qualityNotes.push(`Comparable-company data is partial: ${peers.length} of ${selectedPeerSymbols.length} selected peers were returned before the provider allowance ended.`);
    if (industryGrowthRate !== null) qualityNotes.push("Industry growth is represented by median quarterly year-over-year revenue growth for the returned peer group; it is a near-term benchmark, not a perpetual-growth forecast.");
    if (secCash === null) qualityNotes.push("SEC cash was unavailable; the DCF cash assumption remains sourced from the market-data provider and stays editable.");
    if (overview.Country === "USA") qualityNotes.push("The provider share count remains editable because a single SEC fact can miss multiple voting classes and dilution; check the latest filing.");

    const normalizedResponse = NextResponse.json({
      source: usedSec ? "SEC filings + Alpha Vantage market data" : "Alpha Vantage market data; SEC unavailable",
      asOf: latest.fiscalDate,
      qualityNotes,
      company: {
        symbol: overview.Symbol,
        name: sec?.company.name || overview.Name,
        description: sec?.company.description || "A concise business description could not be extracted from the latest SEC annual filing.",
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
        source: "SEC Company Facts and latest annual filing",
        asOf: sec?.reportDate || null,
        companyDescription: sec?.company.description || "A concise business description could not be extracted from the latest SEC annual filing.",
        financials: {
          revenue: secRevenue,
          cogs: secCogs,
          cogsPercentRevenue: secCogs !== null && secRevenue ? Math.abs(secCogs) / secRevenue * 100 : null,
          grossProfit: secGrossProfit,
          grossMargin: secGrossProfit !== null && secRevenue ? secGrossProfit / secRevenue * 100 : null,
          operatingCashFlow: secOperatingCashFlow,
          freeCashFlow: secFreeCashFlow,
          currentAssets: secCurrentAssets,
          currentLiabilities: secCurrentLiabilities,
          interestExpense: secInterestExpense,
          ebitda: secEbitda,
          netDebt: secNetDebt,
        },
        customerConcentration: {
          disclosures: customerData.disclosures,
          noMajorCustomer: customerData.noMajorCustomer,
          disclosureThreshold: 10,
        },
        supplyChain: {
          signals: supplySignals.slice(0, 6),
          stages: sec?.filing.supplyChainStages || [],
          filingReviewed: Boolean(sec?.filing.textAvailable),
        },
        defaultRisk: {
          ...defaultRisk,
          ratios: { debtToRevenue, netDebtToEbitda, currentRatio, interestCoverage, fcfToDebt },
          altmanZ: null,
          altmanZone: null,
          altmanApplicable: false,
          altmanReason: "Not calculated in SEC-only mode because the original score requires the market value of equity, which SEC Company Facts does not provide as a current market-data field.",
          methodology: "Automated historical screen calculated only from the latest SEC annual facts: leverage, liquidity, interest coverage, and free-cash-flow coverage. It is not a credit rating or a probability of default.",
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
