import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const NASDAQ_API = "https://api.nasdaq.com/api";
const NASDAQ_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
};

const median = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
};

type NasdaqRow = Record<string, string | null>;
type NasdaqTable = { headers?: Record<string, string>; rows?: NasdaqRow[] };

async function nasdaq(endpoint: string, revalidate = 86400) {
  const response = await fetch(`${NASDAQ_API}${endpoint}`, { headers: NASDAQ_HEADERS, next: { revalidate } });
  if (!response.ok) throw new Error(`Nasdaq data request failed (${response.status}).`);
  const payload = await response.json();
  if (payload?.status?.rCode && payload.status.rCode !== 200) {
    throw new Error(payload.status.bCodeMessage?.[0]?.errorMessage || "Nasdaq did not return data for this ticker.");
  }
  if (!payload?.data) throw new Error("Ticker not found or Nasdaq data is unavailable.");
  return payload.data;
}

function fieldValues(data: Record<string, { value?: unknown } | unknown>) {
  return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, value && typeof value === "object" && "value" in value ? value.value : value]));
}

function rawNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "--" || text === "N/A") return null;
  const negative = text.startsWith("-") || /^\(.*\)$/.test(text);
  const parsed = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed * (negative ? -1 : 1) : null;
}

// Nasdaq's financial-statement display values are reported in thousands.
function financialMillions(value: unknown) {
  const parsed = rawNumber(value);
  return parsed === null ? null : parsed / 1000;
}

function isoDate(value: string) {
  const [month, day, year] = value.split("/").map(Number);
  return year && month && day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : value;
}

function tableValue(table: NasdaqTable, labels: string[], column: string) {
  for (const label of labels) {
    const row = table.rows?.find((item) => item.value1 === label);
    const value = row ? financialMillions(row[column]) : null;
    if (value !== null) return value;
  }
  return null;
}

type PeerSet = {
  id: string;
  label: string;
  basis: string;
  symbols: string[];
  patterns: RegExp[];
  operatingCompetitors?: string[];
  rationales?: Record<string, { fit: "direct" | "close" | "adjacent"; businessModel: string; detail: string }>;
};

const peerSets: PeerSet[] = [
  {
    id: "ai-cloud",
    label: "AI-native GPU cloud infrastructure",
    basis: "Companies offering GPU compute or high-density AI infrastructure are more economically comparable than diversified software vendors. Hyperscalers are shown separately as operating competitors because their cloud economics are buried inside much larger businesses.",
    symbols: ["CRWV", "NBIS", "IREN", "APLD"],
    patterns: [/\bai[- ]native\b/i, /\bai cloud\b/i, /\bgpu\b.{0,45}\b(cloud|compute|infrastructure)\b/i, /\b(cloud|compute)\b.{0,45}\b(ai|gpu)\b/i, /purpose-built.{0,35}\bai\b/i, /accelerated[- ]compute/i],
    operatingCompetitors: ["MSFT", "AMZN", "GOOGL", "ORCL"],
    rationales: {
      CRWV: { fit: "direct", businessModel: "Purpose-built AI cloud platform", detail: "Purpose-built AI cloud combining GPU infrastructure, networking, storage, orchestration, and managed software." },
      NBIS: { fit: "direct", businessModel: "Full-stack AI-native cloud", detail: "Full-stack AI-native cloud with GPU compute, data centers, orchestration, storage, and managed AI services." },
      IREN: { fit: "close", businessModel: "AI cloud and power-dense data centers", detail: "Provides GPU AI-cloud services and owns power-dense data centers, but still has a material Bitcoin-mining business." },
      APLD: { fit: "adjacent", businessModel: "AI/HPC data-center developer", detail: "Builds and leases high-density AI/HPC data centers; it is closer to an infrastructure landlord than a full-stack cloud platform." },
    },
  },
  { id: "consumer-ecosystems", label: "Consumer devices and digital ecosystems", basis: "No public company mirrors the full business mix, so the group emphasizes consumer hardware, operating systems, services, and ecosystem reach.", symbols: ["AAPL", "GOOGL", "MSFT", "SONY"], patterns: [/consumer electronics/i, /smartphone/i, /personal technology/i, /devices and services/i] },
  { id: "electric-vehicles", label: "Electric-vehicle manufacturers", basis: "Peers design and manufacture electric vehicles and share exposure to factory utilization, battery costs, pricing, and vehicle demand.", symbols: ["TSLA", "RIVN", "LCID", "NIO"], patterns: [/electric vehicle/i, /\bev manufacturer/i, /battery electric/i] },
  { id: "eda", label: "Electronic design automation and engineering software", basis: "Peers sell mission-critical engineering tools with specialized IP, long product cycles, and workflow switching costs.", symbols: ["SNPS", "CDNS", "ADSK", "PTC"], patterns: [/electronic design automation/i, /semiconductor ip/i, /engineering.{0,20}software/i] },
  { id: "cybersecurity", label: "Enterprise cybersecurity platforms", basis: "Peers sell security software and platforms with recurring revenue, large-enterprise distribution, and high product-integration costs.", symbols: ["PANW", "CRWD", "FTNT", "ZS"], patterns: [/cybersecurity/i, /network security/i, /cloud security/i, /endpoint security/i] },
  { id: "gpu-semiconductors", label: "Accelerated-computing semiconductors", basis: "Peers compete through chip architecture, performance, software ecosystems, manufacturing access, and product cycles.", symbols: ["NVDA", "AMD", "AVGO", "INTC"], patterns: [/graphics processing/i, /\bgpu\b/i, /accelerated computing/i, /semiconductor/i] },
  { id: "data-centers", label: "Data-center ownership and colocation", basis: "Peers monetize power, buildings, interconnection, and leased data-center capacity rather than primarily selling software.", symbols: ["EQIX", "DLR", "IRM", "APLD"], patterns: [/colocation/i, /data center (reit|operator|hosting|infrastructure)/i, /leased data center/i] },
  { id: "public-cloud", label: "Diversified public-cloud platforms", basis: "Peers operate broad cloud-computing platforms spanning compute, storage, databases, software, and developer services.", symbols: ["MSFT", "AMZN", "GOOGL", "ORCL"], patterns: [/public cloud/i, /cloud computing platform/i, /hyperscaler/i, /cloud infrastructure services/i] },
  { id: "enterprise-software", label: "Enterprise application software", basis: "Peers primarily sell standardized, recurring software used across business workflows.", symbols: ["CRM", "NOW", "WDAY", "ORCL"], patterns: [/enterprise software/i, /software as a service/i, /\bsaas\b/i, /business applications/i, /prepackaged software/i] },
  { id: "payments", label: "Digital payments networks and processors", basis: "Peers monetize payment volume, merchant acceptance, transaction processing, and network scale.", symbols: ["V", "MA", "PYPL", "FI"], patterns: [/payment network/i, /payment processing/i, /digital payments/i, /merchant acquiring/i] },
  { id: "banks", label: "Large diversified banks", basis: "Peers are compared on lending, deposits, capital, credit quality, and fee-generating financial services.", symbols: ["JPM", "BAC", "WFC", "C"], patterns: [/\bbank\b/i, /consumer banking/i, /commercial banking/i] },
  { id: "insurance", label: "Property and casualty insurance", basis: "Peers underwrite similar risks and are evaluated using premiums, loss ratios, reserves, and investment income.", symbols: ["CB", "PGR", "ALL", "TRV"], patterns: [/property.{0,10}casualty/i, /insurance underwriting/i, /\binsurance\b/i] },
  { id: "biotech", label: "Large-cap biotechnology", basis: "Peers depend on patented medicines, clinical pipelines, regulatory outcomes, and research productivity.", symbols: ["AMGN", "GILD", "REGN", "VRTX"], patterns: [/biotechnology/i, /biopharma/i, /therapeutic/i] },
  { id: "pharma", label: "Global pharmaceutical companies", basis: "Peers commercialize broad medicine portfolios and are compared on pipeline durability, patent exposure, and global distribution.", symbols: ["MRK", "PFE", "ABBV", "BMY"], patterns: [/pharmaceutical/i, /prescription medicine/i] },
  { id: "automotive", label: "Global vehicle manufacturers", basis: "Peers manufacture and finance vehicles, with similar exposure to production scale, pricing, demand cycles, and capital intensity.", symbols: ["GM", "F", "TM", "HMC"], patterns: [/automotive/i, /automobile manufacturer/i, /vehicles and mobility/i] },
  { id: "energy", label: "Oil and gas producers", basis: "Peers are exposed to commodity prices, production costs, reserve replacement, and capital discipline.", symbols: ["XOM", "CVX", "COP", "EOG"], patterns: [/oil and gas/i, /petroleum/i, /hydrocarbon/i, /energy exploration/i] },
  { id: "utilities", label: "Regulated electric utilities", basis: "Peers earn regulated returns on capital-intensive electricity networks and generation assets.", symbols: ["NEE", "DUK", "SO", "AEP"], patterns: [/electric utility/i, /regulated utility/i, /power utility/i] },
  { id: "telecom", label: "Telecommunications networks", basis: "Peers monetize wireless, broadband, and communications networks with similar capital intensity and subscriber economics.", symbols: ["VZ", "T", "TMUS", "CHTR"], patterns: [/telecommunications/i, /wireless network/i, /broadband services/i] },
  { id: "retail", label: "Large-format and general retail", basis: "Peers compete through merchandise, purchasing scale, stores, logistics, memberships, and consumer pricing.", symbols: ["WMT", "COST", "TGT", "AMZN"], patterns: [/general merchandise/i, /discount retail/i, /membership warehouse/i, /\bretail\b/i] },
  { id: "aerospace", label: "Aerospace and defense contractors", basis: "Peers share long program cycles, government customers, backlogs, engineering requirements, and contract execution risk.", symbols: ["RTX", "LMT", "NOC", "GD"], patterns: [/aerospace/i, /defense contractor/i, /defence contractor/i] },
  { id: "industrials", label: "Diversified industrial technology", basis: "Peers sell engineered equipment and services with exposure to industrial cycles, backlogs, and operating leverage.", symbols: ["HON", "ETN", "EMR", "ROK"], patterns: [/industrial technology/i, /industrial automation/i, /engineered products/i, /manufacturing solutions/i] },
];

const exactPeerSet: Record<string, string> = {
  CRWV: "ai-cloud", NBIS: "ai-cloud", IREN: "ai-cloud", APLD: "ai-cloud",
  SNPS: "eda", CDNS: "eda", NVDA: "gpu-semiconductors", AMD: "gpu-semiconductors",
  PANW: "cybersecurity", CRWD: "cybersecurity", EQIX: "data-centers", DLR: "data-centers",
  AAPL: "consumer-ecosystems", TSLA: "electric-vehicles", RIVN: "electric-vehicles", LCID: "electric-vehicles",
};

function selectPeerSet(company: { symbol: string; sector: string; industry: string; name: string; description: string }) {
  const text = `${company.name} ${company.sector} ${company.industry} ${company.description}`;
  const exact = exactPeerSet[company.symbol];
  const ranked = peerSets
    .map((set) => ({ set, score: set.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0) + (set.id === exact ? 100 : 0) }))
    .sort((a, b) => b.score - a.score);
  const selected = ranked[0]?.score > 0 ? ranked[0].set : peerSets.find((set) => set.id === "enterprise-software")!;
  const symbols = selected.symbols.filter((candidate) => candidate !== company.symbol).slice(0, 3);
  return {
    ...selected,
    symbols,
    industryExplanation: /prepackaged software/i.test(company.industry)
      ? `“Prepackaged software” is a broad legacy classification for standardized software developed for multiple customers. It does not mean boxed software, and it may not describe ${selected.label} economics very well.`
      : `${company.industry} is the reported market classification. The peer set is narrowed using the company description and business model: ${selected.label.toLowerCase()}.`,
  };
}

function growthRate(values: number[]) {
  const valid = values.filter((value) => value > 0);
  if (valid.length < 2) return 0;
  const newest = valid[0];
  const oldest = valid[valid.length - 1];
  return (Math.pow(newest / oldest, 1 / (valid.length - 1)) - 1) * 100;
}

async function nasdaqFundamentals(symbol: string) {
  const encoded = encodeURIComponent(symbol);
  const [profilePayload, summaryPayload, financialPayload] = await Promise.all([
    nasdaq(`/company/${encoded}/company-profile`),
    nasdaq(`/quote/${encoded}/summary?assetclass=stocks`, 3600),
    nasdaq(`/company/${encoded}/financials?frequency=1`),
  ]);
  const profile = fieldValues(profilePayload) as Record<string, unknown>;
  const summary = fieldValues(summaryPayload.summaryData || {}) as Record<string, unknown>;
  const income = financialPayload.incomeStatementTable as NasdaqTable;
  const balance = financialPayload.balanceSheetTable as NasdaqTable;
  const cashFlow = financialPayload.cashFlowTable as NasdaqTable;
  const periodColumns = Object.entries(income.headers || {})
    .filter(([key]) => /^value[2-9]$/.test(key))
    .map(([key, date]) => ({ key, date }))
    .filter((period) => period.date);
  const historical = periodColumns.map(({ key, date }) => {
    const revenue = tableValue(income, ["Total Revenue"], key) || 0;
    const ebit = tableValue(income, ["Operating Income", "Earnings Before Interest and Tax"], key) || 0;
    const depreciation = Math.abs(tableValue(cashFlow, ["Depreciation"], key) || 0);
    const capex = Math.abs(tableValue(cashFlow, ["Capital Expenditures"], key) || 0);
    const operatingCashFlow = tableValue(cashFlow, ["Net Cash Flow-Operating"], key) || 0;
    const cogs = Math.abs(tableValue(income, ["Cost of Revenue"], key) || 0);
    const grossProfit = tableValue(income, ["Gross Profit"], key) ?? revenue - cogs;
    const cash = (tableValue(balance, ["Cash and Cash Equivalents"], key) || 0) + (tableValue(balance, ["Short-Term Investments"], key) || 0);
    const debt = Math.abs(tableValue(balance, ["Short-Term Debt / Current Portion of Long-Term Debt"], key) || 0) + Math.abs(tableValue(balance, ["Long-Term Debt"], key) || 0);
    const fiscalDate = isoDate(date);
    return {
      year: fiscalDate.slice(0, 4),
      fiscalDate,
      revenue,
      ebit,
      ebitMargin: revenue ? ebit / revenue * 100 : 0,
      operatingCashFlow,
      capex,
      capexPercentRevenue: revenue ? capex / revenue * 100 : 0,
      depreciation,
      freeCashFlow: operatingCashFlow - capex,
      cogs,
      grossProfit,
      grossMargin: revenue ? grossProfit / revenue * 100 : 0,
      interestExpense: Math.abs(tableValue(income, ["Interest Expense"], key) || 0),
      cash,
      debt,
      currentAssets: tableValue(balance, ["Total Current Assets"], key) || 0,
      currentLiabilities: tableValue(balance, ["Total Current Liabilities"], key) || 0,
      totalAssets: tableValue(balance, ["Total Assets"], key) || 0,
      totalLiabilities: tableValue(balance, ["Total Liabilities"], key) || 0,
      retainedEarnings: tableValue(balance, ["Retained Earnings"], key) || 0,
      incomeTax: Math.abs(tableValue(income, ["Income Tax"], key) || 0),
      earningsBeforeTax: tableValue(income, ["Earnings Before Tax"], key) || 0,
      netIncome: tableValue(income, ["Net Income", "Net Income Applicable to Common Shareholders"], key) || 0,
    };
  }).filter((row) => row.revenue > 0);
  if (!historical.length) throw new Error("Nasdaq did not return complete annual financial statements for this ticker.");
  return {
    symbol,
    name: String(profile.CompanyName || symbol),
    description: String(profile.CompanyDescription || ""),
    sector: String(profile.Sector || summary.Sector || "Unclassified"),
    industry: String(profile.Industry || summary.Industry || "Unclassified"),
    country: String(profile.Region || "Unclassified"),
    exchange: String(summary.Exchange || "US market"),
    marketCap: (rawNumber(summary.MarketCap) || 0) / 1_000_000,
    previousClose: rawNumber(summary.PreviousClose) || 0,
    historical,
  };
}

async function nasdaqPriceHistory(symbol: string) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 5);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const data = await nasdaq(`/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${date(start)}&todate=${date(end)}&limit=5000`, 3600);
  const daily = (data.tradesTable?.rows || []) as Array<{ date: string; close: string }>;
  const monthly = new Map<string, { date: string; close: number }>();
  for (const row of daily) {
    const pointDate = isoDate(row.date);
    const close = rawNumber(row.close) || 0;
    const month = pointDate.slice(0, 7);
    if (close > 0 && !monthly.has(month)) monthly.set(month, { date: pointDate, close });
  }
  return Array.from(monthly.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function publicMarketDebutDate(symbol: string) {
  try {
    const response = await fetch(`https://stockanalysis.com/stocks/${encodeURIComponent(symbol.toLowerCase())}/company/`, {
      headers: { "User-Agent": NASDAQ_HEADERS["User-Agent"], Accept: "text/html" },
      next: { revalidate: 2592000 },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const value = html.match(/IPO Date<\/td><td[^>]*>([^<]+)<\/td>/i)?.[1]?.trim();
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
  } catch {
    // IPO context is supplemental and must never prevent the DCF from loading.
    return null;
  }
}

function comparableFromNasdaq(company: Awaited<ReturnType<typeof nasdaqFundamentals>>) {
  const latest = company.historical[0];
  const prior = company.historical[1];
  const priceIndependentEv = company.marketCap + latest.debt - latest.cash;
  const ebitda = latest.ebit + latest.depreciation;
  return {
    symbol: company.symbol,
    name: company.name,
    description: company.description,
    sector: company.sector,
    industry: company.industry,
    marketCap: company.marketCap || null,
    revenueGrowth: prior?.revenue ? (latest.revenue / prior.revenue - 1) * 100 : null,
    operatingMargin: latest.revenue ? latest.ebit / latest.revenue * 100 : null,
    evToRevenue: latest.revenue ? priceIndependentEv / latest.revenue : null,
    evToEbitda: ebitda > 0 ? priceIndependentEv / ebitda : null,
    pe: latest.netIncome > 0 ? company.marketCap / latest.netIncome : null,
  };
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

  try {
    const [primary, priceHistory, sec, ipoDate] = await Promise.all([
      nasdaqFundamentals(symbol),
      nasdaqPriceHistory(symbol).catch(() => []),
      secDataset(symbol),
      publicMarketDebutDate(symbol),
    ]);
    const historical = primary.historical;
    const latest = historical[0];
    const peerSet = selectPeerSet({
      symbol,
      sector: primary.sector,
      industry: primary.industry,
      name: primary.name,
      description: sec?.company.description || primary.description,
    });
    const selectedPeerSymbols = peerSet.symbols;
    const peerResults = await Promise.allSettled(selectedPeerSymbols.map((peerSymbol) => nasdaqFundamentals(peerSymbol)));
    const peers = peerResults
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof nasdaqFundamentals>>> => result.status === "fulfilled")
      .map((result) => ({
        ...comparableFromNasdaq(result.value),
        peerFit: peerSet.rationales?.[result.value.symbol]?.fit || "close",
        businessModel: peerSet.rationales?.[result.value.symbol]?.businessModel || peerSet.label,
        peerRationale: peerSet.rationales?.[result.value.symbol]?.detail || `Selected from the ${peerSet.label.toLowerCase()} peer universe.`,
      }));
    const industryGrowthRate = median(peers.map((peer) => peer.revenueGrowth));
    const secMetric = (key: string) => {
      const value = sec?.metrics?.[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    };
    const secCash = secMetric("cash");
    const secDebt = secMetric("debt");
    if (secCash !== null) latest.cash = secCash;
    if (secDebt !== null) latest.debt = secDebt;
    const revenueGrowth = growthRate(historical.map((row) => row.revenue));
    const marketCap = primary.marketCap;
    const estimatedPrice = priceHistory.at(-1)?.close || primary.previousClose;
    const shares = marketCap > 0 && estimatedPrice > 0 ? marketCap / estimatedPrice : 1;
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
      "No Alpha Vantage requests are used. Nasdaq financial statements and cached Nasdaq price history build the DCF without an API key or a 25-request daily quota.",
      "Operating income is used as EBIT; non-operating income and interest are excluded from the EBIT starting point.",
      usedSec ? "The company description, operating analysis, customer concentration, COGS, and default-risk screen use only the latest SEC annual filing and SEC Company Facts." : "SEC annual data was unavailable for this ticker; the separate business-analysis page will show unavailable fields rather than substitute provider estimates.",
    ];
    if (latest.capexPercentRevenue > 50) qualityNotes.push("Latest capex is unusually high and is shown historically, but the starting forecast normalizes it rather than projecting it unchanged forever.");
    if (!priceHistory.length) qualityNotes.push("Monthly stock-price history was unavailable, so the price chart could not be populated for this request.");
    if (peers.length < selectedPeerSymbols.length) qualityNotes.push(`Comparable-company data is partial: Nasdaq returned ${peers.length} of ${selectedPeerSymbols.length} selected peers. Peer failures do not block the main DCF.`);
    if (industryGrowthRate !== null) qualityNotes.push(`Niche growth is represented by median latest annual revenue growth for the returned ${peerSet.label.toLowerCase()} peer group; it is a near-term benchmark, not a perpetual-growth forecast.`);
    if (secCash === null) qualityNotes.push("SEC cash was unavailable; the DCF cash assumption uses Nasdaq's displayed cash and short-term investments and stays editable.");
    qualityNotes.push("Nasdaq does not return beta in this dataset, so the WACC reference build uses a neutral beta of 1.0; the editable WACC should reflect your risk assessment.");
    const latestTaxRate = latest.earningsBeforeTax > 0 ? Math.min(40, Math.max(0, latest.incomeTax / latest.earningsBeforeTax * 100)) : 21;
    const descriptionFromSec = Boolean(sec?.company.description);

    const normalizedResponse = NextResponse.json({
      source: usedSec ? "Nasdaq financials and market data + SEC filings" : "Nasdaq financials and market data; SEC unavailable",
      asOf: latest.fiscalDate,
      qualityNotes,
      company: {
        symbol,
        name: sec?.company.name || primary.name,
        description: sec?.company.description || primary.description || "A concise business description was unavailable.",
        descriptionSource: descriptionFromSec ? "SEC filing" : "Nasdaq company profile",
        ipoDate,
        exchange: primary.exchange,
        currency: "USD",
        country: primary.country,
        sector: primary.sector,
        industry: primary.industry,
      },
      market: {
        marketCap,
        shares,
        estimatedPrice,
        priceDate: priceHistory.at(-1)?.date || null,
        priceBasis: priceHistory.length ? "Latest available Nasdaq closing price" : "Nasdaq previous close",
        beta: 1,
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
        taxRate: latestTaxRate,
      },
      comparison: {
        company: { ...comparableFromNasdaq(primary), peerFit: "focus", businessModel: peerSet.rationales?.[symbol]?.businessModel || peerSet.label, peerRationale: `Focus company classified as ${peerSet.label.toLowerCase()}.` },
        peers,
        selectedPeerSymbols,
        industryGrowthRate,
        nicheLabel: peerSet.label,
        selectionBasis: peerSet.basis,
        industryExplanation: peerSet.industryExplanation,
        operatingCompetitors: peerSet.operatingCompetitors || [],
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
      historical: [...historical].reverse(),
    });
    normalizedResponse.headers.set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return normalizedResponse;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load company data." }, { status: 502 });
  }
}
