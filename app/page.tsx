"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type PricePoint = { date: string; close: number };
type HistoricalRow = {
  year: string;
  revenue: number;
  ebit: number;
  ebitMargin: number;
  operatingCashFlow: number;
  capex: number;
  capexPercentRevenue: number;
  depreciation: number;
  freeCashFlow: number;
  debt?: number;
  interestExpense?: number;
  cogs?: number;
  grossMargin?: number;
  shortDebt?: number;
  longDebt?: number;
};
type BloombergForecastRow = {
  fiscalYear: number;
  revenue: number;
  costRevenue: number;
  operatingExpenses: number;
  taxOnOperatingIncome: number;
  depreciation: number;
  capex: number;
  changeNwc: number;
  deferredTax: number;
  otherNonCash: number;
};
type Comparable = {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  evToRevenue: number | null;
  evToEbitda: number | null;
  pe: number | null;
  peerFit?: "focus" | "direct" | "close" | "adjacent";
  businessModel?: string;
  peerRationale?: string;
};
type CompanyData = {
  source: string;
  asOf: string;
  qualityNotes?: string[];
  company: { symbol: string; name: string; description: string; descriptionSource?: string; ipoDate?: string | null; exchange: string; currency: string; country: string; sector: string; industry: string };
  market: { marketCap: number; shares: number; estimatedPrice: number; priceDate?: string | null; priceBasis?: string; beta: number; priceHistory?: PricePoint[] };
  metrics: { revenueGrowth: number; revenue: number; ebitMargin: number; capexPercentRevenue: number; daPercentRevenue: number; cash: number; debt: number; shortDebt?: number; longDebt?: number; taxRate: number };
  forecast?: { year1Revenue: number; year2Revenue: number; year1Growth: number; year2Growth: number; source: string; sourceUrl: string; asOf?: string } | null;
  comparison?: { company: Comparable; peers: Comparable[]; selectedPeerSymbols: string[]; industryGrowthRate: number | null; nicheLabel?: string; selectionBasis?: string; industryExplanation?: string; operatingCompetitors?: string[] };
  businessAnalysis?: {
    source: string;
    asOf: string | null;
    companyDescription: string;
    financials: Record<string, number | null>;
    customerConcentration: { disclosures: Array<{ customer: string; revenuePercent: number; disclosure: string }>; noMajorCustomer: boolean; disclosureThreshold: number };
    supplyChain: { stages: Array<{ name: string; detail: string }>; signals: Array<{ level: "high" | "medium" | "low"; title: string; detail: string }>; filingReviewed: boolean };
    defaultRisk: { level: "high" | "moderate" | "low" | "insufficient"; points: number; availableChecks?: number; drivers: string[]; ratios: Record<string, number | null>; altmanZ: number | null; altmanZone: string | null; altmanApplicable: boolean; altmanReason?: string; methodology: string };
    filing: { form: string; filingDate: string; reportDate: string; url: string } | null;
  };
  historical: HistoricalRow[];
};
type Model = {
  growth: number;
  margin: number;
  tax: number;
  da: number;
  capex: number;
  nwc: number;
  wacc: number;
  terminalGrowth: number;
  exitMultiple: number;
  cash: number;
  shortDebt: number;
  longDebt: number;
  preferredInterest: number;
  shares: number;
  marketPrice: number;
  valuationDate: string;
};
type Method = "perpetuity" | "multiple";
type WorkbookTab = "dcf" | "assumptions" | "wacc" | "valuation" | "sensitivity";

const demoPrices = Array.from({ length: 67 }, (_, index) => {
  const date = new Date(Date.UTC(2021 + Math.floor(index / 12), index % 12, 1));
  return { date: date.toISOString().slice(0, 10), close: Math.round((28 + index * .42 + Math.sin(index / 3) * 4.2) * 100) / 100 };
});
const demo: CompanyData = {
  source: "Sample data",
  asOf: "2025-12-31",
  company: {
    symbol: "DEMO",
    name: "Northstar Systems",
    description: "Sample technology company used to demonstrate the complete DCF workbook before a ticker is loaded.",
    exchange: "NASDAQ",
    currency: "USD",
    country: "USA",
    sector: "Technology",
    industry: "Software—Infrastructure",
  },
  market: { marketCap: 12500, shares: 250, estimatedPrice: 50, priceDate: null, priceBasis: "Illustrative sample price—not a live quote", beta: 1.15, priceHistory: demoPrices },
  metrics: { revenueGrowth: 12, revenue: 2400, ebitMargin: 24, capexPercentRevenue: 4, daPercentRevenue: 3, cash: 650, debt: 320, taxRate: 21 },
  comparison: {
    company: { symbol: "DEMO", name: "Northstar Systems", description: "Sample enterprise infrastructure software company with workflow and monitoring tools.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 12500, revenueGrowth: 12, operatingMargin: 24, evToRevenue: 4.8, evToEbitda: 17.6, pe: 28.4 },
    peers: [
      { symbol: "ATLS", name: "Atlas Cloud", description: "Sample provider of cloud compute and storage infrastructure.", sector: "Technology", industry: "Cloud Infrastructure", marketCap: 18400, revenueGrowth: 15.5, operatingMargin: 21.2, evToRevenue: 5.6, evToEbitda: 20.4, pe: 31.8 },
      { symbol: "MRDN", name: "Meridian Software", description: "Sample subscription workflow software vendor for large enterprises.", sector: "Technology", industry: "Software—Application", marketCap: 9700, revenueGrowth: 9.3, operatingMargin: 26.8, evToRevenue: 4.1, evToEbitda: 15.2, pe: 24.9 },
      { symbol: "VCTR", name: "Vector Systems", description: "Sample cybersecurity and network monitoring software company.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 15100, revenueGrowth: 11.1, operatingMargin: 22.5, evToRevenue: 4.7, evToEbitda: 18.1, pe: 27.5 },
    ],
    selectedPeerSymbols: ["ATLS", "MRDN", "VCTR"],
    industryGrowthRate: 11.1,
    nicheLabel: "Enterprise infrastructure software",
    selectionBasis: "Illustrative peers demonstrate how business-model matching will narrow a real company’s comparison group.",
    industryExplanation: "Software—Infrastructure is the illustrative reported classification; the sample niche is enterprise infrastructure software.",
    operatingCompetitors: [],
  },
  businessAnalysis: {
    source: "Illustrative sample",
    asOf: "2025-12-31",
    companyDescription: "Sample technology company used to demonstrate the complete DCF workbook before a ticker is loaded.",
    financials: { revenue: 2400, cogs: 960, cogsPercentRevenue: 40, grossProfit: 1440, grossMargin: 60, operatingCashFlow: 506, freeCashFlow: 410, currentAssets: 1800, currentLiabilities: 900, interestExpense: 20, ebitda: 648, netDebt: -330 },
    customerConcentration: { disclosures: [{ customer: "Customer A", revenuePercent: 14, disclosure: "Illustrative sample" }], noMajorCustomer: false, disclosureThreshold: 10 },
    supplyChain: { stages: [{ name: "Critical inputs", detail: "Engineering talent, intellectual property, and cloud infrastructure." }, { name: "Operations", detail: "Develops and supports enterprise infrastructure software." }, { name: "Delivery", detail: "Subscriptions and direct enterprise contracts." }, { name: "End customers", detail: "Businesses using workflow and monitoring tools." }], signals: [{ level: "medium", title: "Infrastructure-provider dependence", detail: "This sample software company relies on external data-center and cloud capacity." }, { level: "medium", title: "Customer concentration", detail: "The illustrative largest customer represents 14% of sample revenue." }], filingReviewed: false },
    defaultRisk: { level: "low", points: 0, drivers: ["The sample leverage, liquidity, coverage, and cash-flow ratios do not show an obvious near-term default warning."], ratios: { debtToRevenue: .133, netDebtToEbitda: -.509, currentRatio: 2, interestCoverage: 28.8, fcfToDebt: 1.28 }, altmanZ: null, altmanZone: null, altmanApplicable: false, altmanReason: "Not calculated for illustrative sample data.", methodology: "Illustrative historical screen—not a credit rating or probability of default." },
    filing: null,
  },
  historical: [
    { year: "2021", revenue: 1450, ebit: 247, ebitMargin: 17, operatingCashFlow: 242, capex: 62, capexPercentRevenue: 4.3, depreciation: 44, freeCashFlow: 180 },
    { year: "2022", revenue: 1650, ebit: 314, ebitMargin: 19, operatingCashFlow: 300, capex: 70, capexPercentRevenue: 4.2, depreciation: 50, freeCashFlow: 230 },
    { year: "2023", revenue: 1880, ebit: 376, ebitMargin: 20, operatingCashFlow: 360, capex: 78, capexPercentRevenue: 4.1, depreciation: 56, freeCashFlow: 282 },
    { year: "2024", revenue: 2150, ebit: 473, ebitMargin: 22, operatingCashFlow: 436, capex: 86, capexPercentRevenue: 4, depreciation: 65, freeCashFlow: 350 },
    { year: "2025", revenue: 2400, ebit: 576, ebitMargin: 24, operatingCashFlow: 506, capex: 96, capexPercentRevenue: 4, depreciation: 72, freeCashFlow: 410 },
  ],
};

const LARGE_COMPANY_EXAMPLES = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "GOOGL", name: "Google" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "JPM", name: "JPMorgan" },
  { symbol: "WMT", name: "Walmart" },
  { symbol: "XOM", name: "Exxon Mobil" },
];
const WSP_DCF_GUIDE = "https://www.wallstreetprep.com/knowledge/dcf-model-training-6-steps-building-dcf-model-excel/";

const industryRules = [
  { match: /AI-native GPU cloud|data-center ownership|data center/i, multiple: 12, wacc: 11, terminal: 2.5, margin: 22, da: 18, capex: 22, note: "AI infrastructure can grow quickly, but GPU obsolescence, power availability, utilization, customer concentration, and heavy financing needs justify a high discount rate and substantial continuing reinvestment." },
  { match: /software|internet|semiconductor|technology/i, multiple: 18, wacc: 9.5, terminal: 3, margin: 22, note: "Technology can support strong margins, but infrastructure-heavy companies require more reinvestment than asset-light software." },
  { match: /bank|insurance|financial/i, multiple: 11, wacc: 9, terminal: 2.5, margin: 18, note: "Financial companies normally require sector-specific equity valuation; this unlevered DCF is a directional cross-check." },
  { match: /biotech|pharma|health/i, multiple: 14, wacc: 10, terminal: 2.5, margin: 18, note: "Pipeline, patent, reimbursement, and regulatory outcomes can dominate historical trends." },
  { match: /oil|gas|energy|mining/i, multiple: 7, wacc: 10, terminal: 1.5, margin: 15, note: "Commodity cycles and reserve replacement make normalized margins more useful than a single recent year." },
  { match: /utility|telecom/i, multiple: 8, wacc: 7.5, terminal: 2, margin: 18, note: "Stable demand can support lower discount rates, while leverage and capital intensity constrain flexibility." },
  { match: /retail|consumer|restaurant/i, multiple: 10, wacc: 9, terminal: 2.5, margin: 12, note: "Brand strength, same-store growth, input costs, and consumer cycles are the key drivers." },
  { match: /industrial|manufactur|aerospace|transport/i, multiple: 9, wacc: 9, terminal: 2.25, margin: 15, note: "Backlogs and operating leverage help visibility, but cyclicality and capital spending increase downside risk." },
];

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const longDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validMedian = (values: Array<number | null>) => {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const peerMedian = (data: CompanyData, key: keyof Pick<Comparable, "marketCap" | "revenueGrowth" | "operatingMargin" | "evToRevenue" | "evToEbitda" | "pe">) => validMedian((data.comparison?.peers || []).map((peer) => peer[key]));

function hasDailyPriceDensity(points: PricePoint[]) {
  if (points.length < 8) return false;
  const recent = points.slice(-24);
  const gaps = recent.slice(1).map((point, index) => {
    const current = new Date(`${point.date}T00:00:00Z`).getTime();
    const previous = new Date(`${recent[index].date}T00:00:00Z`).getTime();
    return (current - previous) / 86_400_000;
  });
  const medianGap = validMedian(gaps);
  return medianGap !== null && medianGap <= 7;
}

function marketPriceContext(data: CompanyData) {
  if (data.source === "Sample data") return { label: "Sample market price", detail: "Illustrative only—not a live quote" };
  if (data.market.priceDate) return { label: "Latest available market price", detail: `Nasdaq close from ${data.market.priceDate}` };
  return { label: "Implied market price", detail: data.market.priceBasis || "Market capitalization divided by reported shares" };
}

function briefDescription(description: string) {
  const clean = description.trim();
  if (!clean) return "A factual company description was not available from Nasdaq or the latest SEC filing.";
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const brief = sentences.slice(0, 2).join(" ").trim();
  return brief.length > 420 ? `${brief.slice(0, 417).trimEnd()}…` : brief;
}

function businessFocus(company: Pick<Comparable, "description" | "industry" | "sector" | "businessModel">) {
  if (company.businessModel) return company.businessModel;
  const text = `${company.industry} ${company.sector} ${company.description}`;
  const rules = [
    { match: /electronic design automation|semiconductor ip/i, label: "Chip-design software and IP" },
    { match: /cybersecurity|security software|network security/i, label: "Cybersecurity software" },
    { match: /ai[- ]native|ai cloud|cloud for ai|gpu.{0,30}(cloud|compute)|accelerated[- ]compute/i, label: "AI-native GPU cloud infrastructure" },
    { match: /cloud infrastructure|data center|compute.*cloud|cloud.*compute/i, label: "Cloud and compute infrastructure" },
    { match: /semiconductor/i, label: "Semiconductor products and IP" },
    { match: /software|saas|application/i, label: "Enterprise software and workflows" },
    { match: /bank|financial services/i, label: "Banking and financial services" },
    { match: /insurance/i, label: "Insurance underwriting" },
    { match: /biotech|pharma|therapeutic/i, label: "Medicines and life-science innovation" },
    { match: /automotive|vehicle|automobile/i, label: "Vehicles and mobility" },
    { match: /retail|consumer|restaurant/i, label: "Consumer products and distribution" },
    { match: /oil|gas|energy/i, label: "Energy production and infrastructure" },
    { match: /utility/i, label: "Regulated utility services" },
    { match: /industrial|manufactur|aerospace|defense/i, label: "Industrial products and services" },
  ];
  return rules.find((rule) => rule.match.test(text))?.label || company.industry || company.sector || "Diversified operations";
}

function businessAssessment(data: CompanyData, company: Comparable) {
  const text = `${company.industry} ${company.description}`;
  const moatRules = [
    { match: /electronic design automation|semiconductor ip/i, score: 2, mechanism: "Specialized design tools can become embedded in customer workflows, creating switching costs and valuable technical IP.", verify: "customer retention, design-win duration, interoperability, and competitive tool performance" },
    { match: /semiconductor/i, score: 2, mechanism: "Proprietary architectures, engineering know-how, software ecosystems, and long design cycles can create durable advantages.", verify: "market share, performance leadership, customer concentration, and product-cycle durability" },
    { match: /ai[- ]native|ai cloud|cloud for ai|gpu.{0,30}(cloud|compute)|accelerated[- ]compute/i, score: 1, mechanism: "Early access to scarce GPUs, high-density infrastructure, orchestration software, and deployment expertise can create an execution advantage, but hardware cycles and well-funded hyperscalers can erode it.", verify: "GPU utilization, return on invested capital, hardware refresh costs, customer concentration, power access, and performance versus hyperscalers" },
    { match: /software|saas|application/i, score: 1, mechanism: "Software may develop switching costs when it is deeply integrated into daily workflows, data, and customer systems.", verify: "retention, recurring revenue, pricing power, implementation cost, and credible substitutes" },
    { match: /cloud infrastructure|data center|compute/i, score: 1, mechanism: "Scale, scarce infrastructure access, and engineering execution can help, although capital intensity and customer concentration can weaken the advantage.", verify: "utilization, unit economics, supplier access, customer concentration, and returns on invested capital" },
    { match: /consumer|retail|restaurant/i, score: 1, mechanism: "Brand, distribution, customer habits, or purchasing scale can support an advantage, but those benefits are not automatic.", verify: "repeat purchasing, price premiums, store economics, and market-share stability" },
    { match: /bank|financial|payment/i, score: 1, mechanism: "Low-cost funding, trusted distribution, network effects, or regulatory scale may provide an advantage.", verify: "funding costs, customer retention, credit performance, and incremental returns on capital" },
    { match: /biotech|pharma|therapeutic/i, score: 1, mechanism: "Patents and clinical differentiation can create temporary exclusivity, but the advantage may expire or fail with the pipeline.", verify: "patent life, clinical outcomes, reimbursement, pipeline depth, and competing treatments" },
  ];
  const rule = moatRules.find((item) => item.match.test(text));
  const medianMargin = peerMedian(data, "operatingMargin");
  const medianScale = peerMedian(data, "marketCap");
  const marginPremium = company.operatingMargin !== null && medianMargin !== null ? company.operatingMargin - medianMargin : null;
  const scaleRatio = company.marketCap !== null && medianScale ? company.marketCap / medianScale : null;
  const evidenceScore = (rule?.score || 0) + (marginPremium !== null && marginPremium > 3 ? 1 : 0) + (scaleRatio !== null && scaleRatio > 1.5 ? 1 : 0);
  const verdict = evidenceScore >= 3 ? "Possible moat—evidence is suggestive" : evidenceScore >= 1 ? "Some moat signals, not established" : "No clear moat established";
  const financialSignal = marginPremium === null
    ? "Peer margin evidence was unavailable."
    : marginPremium > 3
      ? `Its operating margin is ${fmt.format(marginPremium)} percentage points above the peer median, which may indicate pricing power or efficiency.`
      : marginPremium < -3
        ? `Its operating margin is ${fmt.format(Math.abs(marginPremium))} percentage points below the peer median, so the current numbers do not show peer-leading economics.`
        : "Its operating margin is close to the peer median, so the current numbers alone do not establish pricing power.";
  const peerFocuses = Array.from(new Set((data.comparison?.peers || []).map(businessFocus))).filter((focus) => focus !== businessFocus(company));
  const difference = peerFocuses.length
    ? `${company.symbol} is categorized as ${businessFocus(company)}. The automatic peer set also includes ${peerFocuses.slice(0, 3).join(", ")}, so differences in capital intensity and revenue model matter when comparing multiples.`
    : `${company.symbol} and the returned peers share a broadly similar ${businessFocus(company).toLowerCase()} focus; product depth, customer mix, geography, and execution may still differ materially.`;
  return {
    verdict,
    mechanism: rule?.mechanism || "The provider description and financial ratios do not reveal a specific durable competitive advantage.",
    verify: rule?.verify || "customer retention, pricing power, market share, returns on invested capital, and credible substitutes",
    financialSignal,
    difference,
  };
}

function recommendations(data: CompanyData) {
  const text = `${data.comparison?.nicheLabel || ""} ${data.company.sector} ${data.company.industry}`;
  const rule = industryRules.find((item) => item.match.test(text)) || { multiple: 10, wacc: 9.5, terminal: 2.5, margin: 15, note: "Use a conservative starting point and compare every assumption with direct industry peers." };
  const historicalGrowth = data.metrics.revenueGrowth;
  const growth = data.forecast?.year1Growth ?? (historicalGrowth > 100 ? 40 : historicalGrowth > 50 ? 30 : historicalGrowth > 25 ? 20 : clamp(historicalGrowth * .65, 2, 18));
  const margin = data.metrics.ebitMargin < 3 ? rule.margin : clamp(data.metrics.ebitMargin, 3, 40);
  const currentDa = clamp(data.metrics.daPercentRevenue || data.metrics.capexPercentRevenue * .75, 1, 50);
  const da = "da" in rule && typeof rule.da === "number" ? rule.da : currentDa;
  const currentCapex = data.metrics.capexPercentRevenue > 50 ? clamp(currentDa * 1.05, 20, 50) : clamp(data.metrics.capexPercentRevenue, 1, 30);
  const capex = "capex" in rule && typeof rule.capex === "number" ? rule.capex : currentCapex;
  const leverage = data.metrics.debt / Math.max(data.metrics.revenue, 1);
  const riskPremium = leverage > 2 ? 1 : leverage > 1 ? .5 : 0;
  return { ...rule, growth: Math.round(clamp(growth, -30, 200) * 10) / 10, margin: Math.round(margin * 10) / 10, da: Math.round(da * 10) / 10, capex: Math.round(capex * 10) / 10, wacc: Math.min(13, rule.wacc + riskPremium) };
}

function buildModel(data: CompanyData): Model {
  const rec = recommendations(data);
  const valuationDate = new Date().toISOString().slice(0, 10);
  return {
    growth: rec.growth,
    margin: rec.margin,
    tax: data.metrics.taxRate || 21,
    da: rec.da,
    capex: rec.capex,
    nwc: 2,
    wacc: rec.wacc,
    terminalGrowth: rec.terminal,
    exitMultiple: rec.multiple,
    cash: data.metrics.cash,
    shortDebt: data.metrics.shortDebt || 0,
    longDebt: data.metrics.longDebt ?? data.metrics.debt,
    preferredInterest: 0,
    shares: data.market.shares || 1,
    marketPrice: Math.round(data.market.estimatedPrice * 100) / 100,
    valuationDate,
  };
}

function generatedBloombergRows(data: CompanyData, model: Model, growthShift = 0, marginShift = 0): BloombergForecastRow[] {
  const latest = data.historical[data.historical.length - 1];
  const firstFiscalYear = Number(data.asOf.slice(0, 4)) + 1;
  const forecast = data.forecast;
  const startingGrowth = Math.max(model.terminalGrowth, model.growth + growthShift);
  const secondYearGrowth = forecast ? forecast.year2Growth + (startingGrowth - forecast.year1Growth) * .6 : null;
  // A perpetuity cannot begin while the explicit forecast is still in a high-growth phase.
  // Fade the last forecast year to the selected mature growth rate so Year 5 is a
  // blend of two near-mature calendar years rather than an abrupt growth cliff.
  const normalizedGrowth = model.terminalGrowth;
  const latestGrossMargin = latest?.grossMargin ?? (latest?.cogs && latest.revenue ? (latest.revenue - latest.cogs) / latest.revenue * 100 : Math.max(model.margin + 15, 30));
  const startingDaPercent = Math.min(Math.max(model.da, data.metrics.daPercentRevenue || model.da), Math.max(50, model.da));
  const startingCapexPercent = Math.min(Math.max(model.capex, data.metrics.capexPercentRevenue || model.capex), Math.max(80, model.capex));
  let revenue = data.metrics.revenue;
  let previousRevenue = revenue;
  return Array.from({ length: 6 }, (_, index) => {
    const year = index + 1;
    const fallbackGrowth = startingGrowth + (normalizedGrowth - startingGrowth) * (index / 5);
    const forecastFade = secondYearGrowth !== null && secondYearGrowth > 0 && normalizedGrowth > 0
      ? secondYearGrowth * Math.pow(normalizedGrowth / secondYearGrowth, (index - 1) / 4)
      : secondYearGrowth === null ? fallbackGrowth : secondYearGrowth + (normalizedGrowth - secondYearGrowth) * ((index - 1) / 4);
    const growth = forecast && secondYearGrowth !== null
      ? index === 0 ? startingGrowth : index === 1 ? secondYearGrowth : forecastFade
      : fallbackGrowth;
    revenue *= 1 + growth / 100;
    const progress = Math.min(1, year / 5);
    const margin = data.metrics.ebitMargin + (model.margin + marginShift - data.metrics.ebitMargin) * progress;
    const grossMargin = clamp(latestGrossMargin + (Math.max(latestGrossMargin, margin + 8) - latestGrossMargin) * progress, margin, 95);
    const grossProfit = revenue * grossMargin / 100;
    const ebit = revenue * margin / 100;
    const daPercent = startingDaPercent + (model.da - startingDaPercent) * progress;
    const capexPercent = startingCapexPercent + (model.capex - startingCapexPercent) * progress;
    const row = {
      fiscalYear: firstFiscalYear + index,
      revenue,
      costRevenue: revenue - grossProfit,
      operatingExpenses: Math.max(0, grossProfit - ebit),
      taxOnOperatingIncome: ebit * model.tax / 100,
      depreciation: revenue * daPercent / 100,
      capex: revenue * capexPercent / 100,
      changeNwc: (revenue - previousRevenue) * model.nwc / 100,
      deferredTax: 0,
      otherNonCash: 0,
    };
    previousRevenue = revenue;
    return row;
  });
}

function calculate(
  data: CompanyData,
  model: Model,
  method: Method,
  growthShift = 0,
  marginShift = 0,
  overrides: { wacc?: number; terminalGrowth?: number; exitMultiple?: number } = {},
) {
  const waccPercent = overrides.wacc ?? model.wacc;
  const terminalGrowth = overrides.terminalGrowth ?? model.terminalGrowth;
  const exitMultiple = overrides.exitMultiple ?? model.exitMultiple;
  const wacc = waccPercent / 100;
  const rows = generatedBloombergRows(data, model, growthShift, marginShift);
  const valuationDate = new Date(`${model.valuationDate}T00:00:00Z`);
  const firstYearStart = Date.UTC(rows[0].fiscalYear, 0, 1);
  const nextYearStart = Date.UTC(rows[0].fiscalYear + 1, 0, 1);
  const millisecondsPerDay = 86_400_000;
  const daysInFirstYear = (nextYearStart - firstYearStart) / millisecondsPerDay;
  // Bloomberg excludes the valuation date itself from the remaining-year fraction.
  const firstYearWeight = clamp(((nextYearStart - valuationDate.getTime()) / millisecondsPerDay - 1) / daysInFirstYear, 0, 1);
  const lastYearWeight = 1 - firstYearWeight;
  const weights = [firstYearWeight, 1, 1, 1, 1, lastYearWeight];
  const periods = [firstYearWeight / 2, firstYearWeight + .5, firstYearWeight + 1.5, firstYearWeight + 2.5, firstYearWeight + 3.5, firstYearWeight + 4 + lastYearWeight / 2];
  let previousRevenue = data.metrics.revenue;
  const years = rows.map((row, index) => {
    const grossProfit = row.revenue - row.costRevenue;
    const ebit = grossProfit - row.operatingExpenses;
    const nopat = ebit - row.taxOnOperatingIncome;
    const calculatedFcf = nopat + row.depreciation - row.capex - row.changeNwc + row.deferredTax + row.otherNonCash;
    const fcf = calculatedFcf;
    const ebitda = ebit + row.depreciation;
    const discountFactor = 1 / Math.pow(1 + wacc, periods[index]);
    const year = {
      year: row.fiscalYear,
      growth: previousRevenue ? (row.revenue / previousRevenue - 1) * 100 : 0,
      margin: row.revenue ? ebit / row.revenue * 100 : 0,
      grossMargin: row.revenue ? grossProfit / row.revenue * 100 : 0,
      daPercent: row.revenue ? row.depreciation / row.revenue * 100 : 0,
      capexPercent: row.revenue ? row.capex / row.revenue * 100 : 0,
      nwcPercent: row.revenue ? row.changeNwc / row.revenue * 100 : 0,
      deferredTaxPercent: row.revenue ? row.deferredTax / row.revenue * 100 : 0,
      revenue: row.revenue,
      costRevenue: row.costRevenue,
      grossProfit,
      operatingExpenses: row.operatingExpenses,
      ebit,
      tax: row.taxOnOperatingIncome,
      taxRate: ebit ? row.taxOnOperatingIncome / ebit * 100 : 0,
      nopat,
      depreciation: row.depreciation,
      capex: row.capex,
      changeNwc: row.changeNwc,
      deferredTax: row.deferredTax,
      otherNonCash: row.otherNonCash,
      fcf,
      ebitda,
      weight: weights[index],
      discountPeriod: periods[index],
      discountFactor,
      pv: fcf * weights[index] * discountFactor,
    };
    previousRevenue = row.revenue;
    return year;
  });
  const terminalFcf = years[4].fcf * firstYearWeight + years[5].fcf * lastYearWeight;
  const terminalEbitda = years[4].ebitda * firstYearWeight + years[5].ebitda * lastYearWeight;
  const terminalValue = method === "perpetuity"
    ? waccPercent > terminalGrowth ? terminalFcf * (1 + terminalGrowth / 100) / (wacc - terminalGrowth / 100) : 0
    : terminalEbitda * exitMultiple;
  const pvTerminal = terminalValue / Math.pow(1 + wacc, 5);
  const pvForecast = years.reduce((sum, year) => sum + year.pv, 0);
  const enterpriseValue = pvForecast + pvTerminal;
  const totalDebt = model.shortDebt + model.longDebt;
  const rawEquityValue = enterpriseValue + model.cash - totalDebt - model.preferredInterest;
  const equityValue = Math.max(0, rawEquityValue);
  const perShare = equityValue / Math.max(model.shares, 1);
  return { years, firstYearWeight, lastYearWeight, terminalFcf, terminalEbitda, terminalValue, pvTerminal, pvForecast, enterpriseValue, rawEquityValue, equityValue, perShare, terminalShare: enterpriseValue ? pvTerminal / enterpriseValue * 100 : 0 };
}

function moveFromPrice(value: number, price: number) {
  const change = price ? (value / price - 1) * 100 : 0;
  return { change, label: change >= 0 ? "Upside" : "Downside" };
}

function geopoliticalExposure(data: CompanyData) {
  const country = data.company.country || "Unknown domicile";
  const businessNiche = data.comparison?.nicheLabel || data.company.industry || data.company.sector;
  const context = `${businessNiche} ${data.company.industry} ${data.company.sector} ${data.company.description}`;
  const filingSignal = data.businessAnalysis?.supplyChain.signals.find((signal) =>
    /geographic|china|taiwan|export|sanction|trade/i.test(`${signal.title} ${signal.detail}`),
  );
  const countryRisk = /china|russia|taiwan|ukraine|israel/i.test(country);
  let sensitiveIndustry = false;
  let channel = `The automated data does not identify an obvious geopolitically sensitive business model. The main unanswered questions are how much revenue, sourcing, and operating capacity sit outside ${country}.`;

  if (/ai[- ]native|gpu cloud|accelerated[- ]compute|data center/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are advanced-GPU export controls, a concentrated Asian chip supply chain, and country-specific power and data-center rules. Restrictions or conflict could delay server deliveries, raise equipment costs, or limit which customers the company can serve.";
  } else if (/electronic design automation|semiconductor ip|chip[- ]design/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are export-license restrictions on chip-design software or IP, especially for certain Chinese customers, plus dependence on a semiconductor ecosystem concentrated in Taiwan and East Asia. Those restrictions can reduce sales or disrupt customers' product schedules.";
  } else if (/semiconductor|chip|foundr/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are fabrication and packaging capacity concentrated in East Asia, restrictions on advanced-chip sales to China, and limits on semiconductor equipment exports. A disruption can reduce available supply, delay launches, or increase input costs.";
  } else if (/aerospace|defense/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are government procurement decisions, sanctions, export licenses, and restrictions on selling sensitive products across borders. These can delay contracts or prevent sales to particular customers and countries.";
  } else if (/oil|gas|energy|mining|commodity/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are sanctions, resource nationalism, cross-border pipelines or shipping routes, and local taxes or royalties. These can interrupt production, raise transport costs, or restrict access to markets.";
  } else if (/shipping|freight|maritime/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are wars and sanctions that close trade routes, port restrictions, and disruption at shipping chokepoints. These can lengthen routes, raise fuel and insurance costs, or reduce shipment volumes.";
  } else if (/cloud|software|internet|telecom/i.test(context)) {
    channel = "The main cross-border exposures are data-localization laws, privacy rules, sanctions, and government restrictions on digital services. These can require local infrastructure, increase compliance costs, or block service in a market.";
  }

  if (filingSignal) {
    channel = `${filingSignal.detail} ${channel}`;
  }

  const level: "high" | "medium" | "low" = countryRisk ? "high" : filingSignal || sensitiveIndustry ? "medium" : "low";
  const evidenceLimit = data.businessAnalysis?.supplyChain.filingReviewed
    ? "This screen reviewed the latest annual filing, but it does not calculate revenue or supplier percentages by country."
    : "A parseable annual filing was not available, so this screen uses only the reported region and business type—not revenue or supplier percentages by country.";
  return {
    level,
    title: "Geopolitical and cross-border exposure",
    detail: `For ${data.company.symbol}, the dataset lists ${country} as its region and identifies the business as ${businessNiche}. ${channel} This matters to the DCF because it can lower revenue growth or increase capex and operating costs. ${evidenceLimit}`,
  };
}

function riskAnalysis(data: CompanyData, model: Model, perpetuity: ReturnType<typeof calculate>, multiple: ReturnType<typeof calculate>) {
  const risks: Array<{ level: "high" | "medium" | "low"; title: string; detail: string }> = [];
  const capex = data.metrics.capexPercentRevenue;
  risks.push({ level: capex > 12 ? "high" : capex > 6 ? "medium" : "low", title: "Capital intensity", detail: `${fmt.format(capex)}% of latest revenue was spent on capex. High reinvestment can prevent accounting profit from becoming distributable cash.` });
  const leverage = data.metrics.debt / Math.max(data.metrics.revenue, 1);
  risks.push({ level: leverage > 1 ? "high" : leverage > .45 ? "medium" : "low", title: "Balance-sheet leverage", detail: `Debt equals ${fmt.format(leverage * 100)}% of annual revenue. Refinancing risk rises if rates increase or earnings deteriorate.` });
  const terminalShare = Math.max(perpetuity.terminalShare, multiple.terminalShare);
  risks.push({ level: terminalShare > 80 ? "high" : terminalShare > 65 ? "medium" : "low", title: "Terminal-value dependence", detail: `${fmt.format(perpetuity.terminalShare)}% of perpetual-growth enterprise value and ${fmt.format(multiple.terminalShare)}% of exit-multiple enterprise value come from value beyond Year 5.` });
  risks.push(geopoliticalExposure(data));
  const marginRows = data.historical.filter((row) => Number.isFinite(row.ebitMargin));
  const lowMarginRow = marginRows.reduce<HistoricalRow | null>((lowest, row) => !lowest || row.ebitMargin < lowest.ebitMargin ? row : lowest, null);
  const highMarginRow = marginRows.reduce<HistoricalRow | null>((highest, row) => !highest || row.ebitMargin > highest.ebitMargin ? row : highest, null);
  const spread = lowMarginRow && highMarginRow ? highMarginRow.ebitMargin - lowMarginRow.ebitMargin : 0;
  const marginDetail = lowMarginRow && highMarginRow
    ? `EBIT margin ranged from ${fmt.format(lowMarginRow.ebitMargin)}% in ${lowMarginRow.year} to ${fmt.format(highMarginRow.ebitMargin)}% in ${highMarginRow.year}, a ${fmt.format(spread)} percentage-point swing. The DCF currently assumes a ${fmt.format(model.margin)}% margin. A wide historical range means operating profit—and therefore free cash flow—may be harder to forecast reliably.`
    : `There was not enough historical EBIT-margin data to judge stability. The DCF currently assumes a ${fmt.format(model.margin)}% margin, so verify that assumption against company guidance and a full business cycle.`;
  risks.push({ level: spread > 15 ? "high" : spread > 7 ? "medium" : "low", title: "Operating-margin consistency", detail: marginDetail });
  const lowValue = Math.min(perpetuity.perShare, multiple.perShare);
  const highValue = Math.max(perpetuity.perShare, multiple.perShare);
  const conservativeMove = moveFromPrice(lowValue, model.marketPrice);
  const valuationDetail = model.marketPrice <= 0
    ? `The two DCF methods imply ${usd.format(lowValue)}–${usd.format(highValue)} per share, but a valid market price was unavailable, so the model cannot measure room for forecast error.`
    : conservativeMove.change >= 0
      ? `The lower of the two DCF estimates is ${usd.format(lowValue)}, which is ${fmt.format(conservativeMove.change)}% above the ${usd.format(model.marketPrice)} market-price input. That difference is the room for forecast error: the conservative estimate exceeds the price by ${usd.format(lowValue - model.marketPrice)} per share. The other method gives ${usd.format(highValue)}.`
      : `The lower of the two DCF estimates is ${usd.format(lowValue)}, which is ${fmt.format(Math.abs(conservativeMove.change))}% below the ${usd.format(model.marketPrice)} market-price input. On the more conservative method, the stock price already exceeds estimated value, so there is no margin of safety. The other method gives ${usd.format(highValue)}.`;
  risks.push({ level: conservativeMove.change < 10 ? "high" : conservativeMove.change < 25 ? "medium" : "low", title: "Room for forecast error", detail: valuationDetail });
  return risks;
}

const TERM_DEFINITIONS = {
  ufcf: "Unlevered Free Cash Flow: cash generated by operations after tax and reinvestment, but before interest or debt payments. It belongs to both lenders and shareholders.",
  wacc: "Weighted Average Cost of Capital: the annual return required by the company’s debt and equity investors. A higher WACC lowers today’s value of future cash flows.",
  ebit: "Earnings Before Interest and Taxes: operating profit before financing costs and income taxes.",
  nopat: "Net Operating Profit After Tax: EBIT after normalized cash taxes, while still excluding interest and other financing costs.",
  ebitda: "Earnings Before Interest, Taxes, Depreciation, and Amortization: an operating earnings measure before non-cash D&A. It is not the same as free cash flow.",
  da: "Depreciation and amortization: non-cash accounting charges that spread the cost of long-lived assets and acquired intangibles over time.",
  capex: "Capital expenditures: cash spent on long-lived assets such as equipment, facilities, servers, or infrastructure.",
  nwc: "Net working capital: short-term operating assets minus short-term operating liabilities. Growth can consume cash when receivables or inventory rise faster than payables.",
  pv: "Present value: what a future cash flow is worth today after discounting it for time and risk.",
  terminalValue: "Terminal value: the estimated value of all cash flows after the explicit five-year forecast. It often represents a large share of a DCF.",
  perpetualGrowth: "Perpetual growth method: assumes cash flow grows at a stable rate forever after Year 5. The growth rate must stay below WACC.",
  exitMultiple: "Exit multiple method: estimates the company’s Year 5 value by multiplying Year 5 EBITDA by a market valuation multiple.",
  enterpriseValue: "Enterprise value: the value of the operating business available to both lenders and shareholders, before adding cash and subtracting debt.",
  equityValue: "Equity value: the portion belonging to common shareholders after adding available cash and subtracting debt and other senior claims.",
  dilutedShares: "Diluted shares: the share count including potential dilution from options, restricted stock, convertibles, and similar securities.",
  discountFactor: "Discount factor: the multiplier that converts a future cash flow into today’s dollars using WACC and the number of years away.",
  revenueGrowth: "Starting revenue growth: the expected percentage increase in sales during Year 1. The model gradually fades this rate toward the long-run terminal growth rate.",
  ebitMargin: "Target EBIT margin: the percentage of revenue expected to remain as operating profit before interest and taxes by Year 5.",
  taxRate: "Tax rate: the normalized cash tax percentage applied to positive operating profit. It should reflect a sustainable rate rather than a one-time tax benefit or charge.",
  terminalGrowth: "Terminal growth: the annual rate the company is assumed to grow forever after Year 5. It must remain below WACC and should resemble a mature long-run growth rate.",
  marketPrice: "Market price: the current or reference share price used only to calculate potential upside or downside. Changing it does not change the DCF’s intrinsic value.",
  cash: "Cash: cash considered available to shareholders. It is added to enterprise value when calculating equity value.",
  fundedDebt: "Funded debt: interest-bearing borrowings that must be repaid. It is subtracted from enterprise value before calculating equity value.",
  riskFreeRate: "Risk-free rate: the return investors could earn with minimal default risk, commonly approximated with a long-term U.S. Treasury yield. It forms the starting point for required returns.",
  beta: "Beta: an estimate of how sensitive the stock has been to broad market movements. A beta of 1.0 moves roughly with the market; above 1.0 implies greater market sensitivity.",
  equityRiskPremium: "Equity risk premium: the additional annual return investors require for owning stocks instead of a risk-free asset.",
  costOfEquity: "Cost of equity: the return shareholders require for taking the company’s risk. This reference uses risk-free rate + beta × equity risk premium.",
  equityWeight: "Equity / capital: the percentage of the company’s financing represented by equity market value. It determines how much the cost of equity influences WACC.",
  preTaxCostOfDebt: "Pre-tax cost of debt: the estimated interest rate the company pays or would pay on borrowings before the tax benefit of deductible interest.",
  debtWeight: "Debt / capital: the percentage of financing represented by funded debt. It determines how much the after-tax cost of debt influences WACC.",
} as const;

type DefinedTermKey = keyof typeof TERM_DEFINITIONS;

function DefinedTerm({ term, children }: { term: DefinedTermKey; children: string }) {
  const definition = TERM_DEFINITIONS[term];
  return <span className="defined-term" tabIndex={0} title={definition} data-definition={definition}>{children}</span>;
}

const DCF_ROW_TERMS: Record<string, DefinedTermKey> = {
  EBIT: "ebit",
  "Operating Income": "ebit",
  NOPAT: "nopat",
  "D&A / revenue": "da",
  "D&A / Revenue": "da",
  "Depreciation & amortization": "da",
  "Plus: Depreciation & Amortization": "da",
  "Capex / revenue": "capex",
  "Capex / Revenue": "capex",
  "Less: Capital Expenditure": "capex",
  "Capital expenditures": "capex",
  "Change in net working capital": "nwc",
  "Less: Changes in Net Working Capital": "nwc",
  "Unlevered Free Cash Flow (UFCF)": "ufcf",
  "Free Cash Flow": "ufcf",
  "Discount factor": "discountFactor",
  "Discount Factor": "discountFactor",
  "PV of UFCF": "pv",
  "Present Value of Free Cash Flow": "pv",
  "Perpetual-growth terminal value": "terminalValue",
  "PV of perpetual terminal value": "pv",
  "Exit-multiple terminal value": "terminalValue",
  "PV of exit-multiple terminal value": "pv",
};

function DcfRowLabel({ label }: { label: string }) {
  const term = DCF_ROW_TERMS[label];
  return term ? <DefinedTerm term={term}>{label}</DefinedTerm> : label;
}

function NumberField({ label, term, value, suffix, help, onChange }: { label: string; term?: DefinedTermKey; value: number; suffix: string; help: string; onChange: (value: number) => void }) {
  const [showHelp, setShowHelp] = useState(false);
  return <div className="number-field">
    <div className="field-label"><span>{term ? <DefinedTerm term={term}>{label}</DefinedTerm> : label}</span><button type="button" aria-label={`Explain ${label}`} aria-expanded={showHelp} onClick={() => setShowHelp((open) => !open)}>?</button></div>
    <div className="input-cell"><input aria-label={`${label} ${suffix}`} type="number" step="0.1" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} /><b>{suffix}</b></div>
    {showHelp && <p className="field-help">{help}</p>}
  </div>;
}

function DateField({ value, help, onChange }: { value: string; help: string; onChange: (value: string) => void }) {
  const [showHelp, setShowHelp] = useState(false);
  return <div className="number-field">
    <div className="field-label"><span>Valuation date</span><button type="button" aria-label="Explain valuation date" aria-expanded={showHelp} onClick={() => setShowHelp((open) => !open)}>?</button></div>
    <div className="input-cell"><input aria-label="Valuation date" type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>
    {showHelp && <p className="field-help">{help}</p>}
  </div>;
}

function ValueMove({ value, price }: { value: number; price: number }) {
  const move = moveFromPrice(value, price);
  return <span className={move.change >= 0 ? "move positive" : "move negative"}>{move.label} {fmt.format(Math.abs(move.change))}%</span>;
}

function ValuationBridge({ title, result, model, method, data }: { title: string; result: ReturnType<typeof calculate>; model: Model; method: Method; data: CompanyData }) {
  const industryGrowth = data.comparison?.industryGrowthRate ?? null;
  const peerMultiples = (data.comparison?.peers || []).map((peer) => peer.evToEbitda).filter((value): value is number => value !== null && Number.isFinite(value));
  const medianMultiple = validMedian(peerMultiples);
  const impliedExitMultiple = result.terminalEbitda > 0 ? result.terminalValue / result.terminalEbitda : null;
  const terminalFcfYield = result.terminalValue > 0 ? result.terminalFcf / result.terminalValue : null;
  const impliedGrowth = terminalFcfYield === null ? null : (model.wacc / 100 - terminalFcfYield) / (1 + terminalFcfYield) * 100;
  return <div className="bridge-table">
    <div className="sheet-bar">{title}</div>
    {method === "perpetuity" ? <>
      <div className="method-explainer"><span>WHAT THIS METHOD DOES</span><p>Following the Bloomberg XDCF convention, the model blends the two calendar-year forecasts surrounding the exact five-year valuation date. That Year-5 <DefinedTerm term="ufcf">free cash flow</DefinedTerm> grows at a stable rate forever and is discounted back exactly five years.</p><code>{fmt.format(result.terminalFcf)} × (1 + {fmt.format(model.terminalGrowth)}%) ÷ ({fmt.format(model.wacc)}% − {fmt.format(model.terminalGrowth)}%) = {fmt.format(result.terminalValue)}</code><small>Year-5 FCF × growth adjustment ÷ (<DefinedTerm term="wacc">WACC</DefinedTerm> − perpetual growth)</small></div>
      <div className="reference-row"><span>Observed niche-peer growth</span><b>{industryGrowth === null ? "—" : `${fmt.format(industryGrowth)}%`}</b></div>
      <div><span>Selected perpetual growth</span><b>{fmt.format(model.terminalGrowth)}%</b></div>
      <div><span>Year 5 <DefinedTerm term="ufcf">FCF</DefinedTerm></span><b>{usd0.format(result.terminalFcf)}M</b></div>
      <div><span>Implied exit <DefinedTerm term="exitMultiple">multiple</DefinedTerm></span><b>{impliedExitMultiple === null ? "—" : `${fmt.format(impliedExitMultiple)}×`}</b></div>
      <p className="bridge-note">Peer growth is median recent year-over-year revenue growth for the selected business niche. It is context—not a perpetual forecast—and the perpetual rate must remain below <DefinedTerm term="wacc">WACC</DefinedTerm>. The implied exit multiple is the cross-check against the exit-multiple method.</p>
    </> : <>
      <div className="method-explainer"><span>WHAT THIS METHOD DOES</span><p>Following the Bloomberg XDCF convention, the model blends EBITDA at the exact five-year valuation date, applies the selected enterprise-value multiple, and discounts that terminal value back exactly five years.</p><code>{fmt.format(result.terminalEbitda)} × {fmt.format(model.exitMultiple)} = {fmt.format(result.terminalValue)}</code><small>Year-5 <DefinedTerm term="ebitda">EBITDA</DefinedTerm> × selected <DefinedTerm term="exitMultiple">exit multiple</DefinedTerm></small></div>
      <div><span>Year 5 <DefinedTerm term="ebitda">EBITDA</DefinedTerm></span><b>{usd0.format(result.terminalEbitda)}M</b></div>
      <div><span>Selected exit multiple</span><b>{fmt.format(model.exitMultiple)}×</b></div>
      <div className="reference-row"><span>Peer median EV / <DefinedTerm term="ebitda">EBITDA</DefinedTerm></span><b>{medianMultiple === null ? "—" : `${fmt.format(medianMultiple)}×`}</b></div>
      <div><span>Peer EV / <DefinedTerm term="ebitda">EBITDA</DefinedTerm> range</span><b>{peerMultiples.length ? `${fmt.format(Math.min(...peerMultiples))}–${fmt.format(Math.max(...peerMultiples))}×` : "—"}</b></div>
      <div><span>Implied perpetual growth</span><b>{impliedGrowth === null ? "—" : `${fmt.format(impliedGrowth)}%`}</b></div>
      <p className="bridge-note">The selected exit multiple stays editable. Compare it with the peer range and explain any premium or discount. The implied perpetual-growth rate is the cross-check against the perpetuity method.</p>
    </>}
    <div><span><DefinedTerm term="pv">PV</DefinedTerm> of forecast <DefinedTerm term="ufcf">UFCF</DefinedTerm></span><b>{usd0.format(result.pvForecast)}M</b></div>
    <div><span><DefinedTerm term="pv">PV</DefinedTerm> of <DefinedTerm term="terminalValue">terminal value</DefinedTerm></span><b>{usd0.format(result.pvTerminal)}M</b></div>
    <div className="total"><span><DefinedTerm term="enterpriseValue">Enterprise value</DefinedTerm></span><b>{usd0.format(result.enterpriseValue)}M</b></div>
    <div><span>Plus: Cash</span><b>{usd0.format(model.cash)}M</b></div>
    <div><span>Less: Short-term debt</span><b>({usd0.format(model.shortDebt)}M)</b></div>
    <div><span>Less: Long-term debt</span><b>({usd0.format(model.longDebt)}M)</b></div>
    <div><span>Less: Leases, preferred and minority interest</span><b>({usd0.format(model.preferredInterest)}M)</b></div>
    <div className="total"><span><DefinedTerm term="equityValue">Equity value</DefinedTerm></span><b>{usd0.format(result.equityValue)}M</b></div>
    <div><span><DefinedTerm term="dilutedShares">Share count used</DefinedTerm></span><b>{fmt.format(model.shares)}M</b></div>
    <div className="answer"><span>Implied price per share</span><b>{usd.format(result.perShare)}</b></div>
  </div>;
}

function SensitivityTable({ data, model, method }: { data: CompanyData; model: Model; method: Method }) {
  const waccs = [-1, -.5, 0, .5, 1].map((shift) => Math.max(1, model.wacc + shift));
  const columns = method === "perpetuity"
    ? [-1, -.5, 0, .5, 1].map((shift) => Math.max(0, model.terminalGrowth + shift))
    : [-4, -2, 0, 2, 4].map((shift) => Math.max(1, model.exitMultiple + shift));
  return <div className="sensitivity-wrap">
    <div className="sheet-bar">Implied price per share — {method === "perpetuity" ? "Perpetual growth" : "Exit multiple"}</div>
    <div className="table-scroll"><table className="sensitivity-table"><thead><tr><th><DefinedTerm term="wacc">WACC</DefinedTerm> ↓</th>{columns.map((value) => <th key={value}>{fmt.format(value)}{method === "perpetuity" ? "%" : "×"}</th>)}</tr></thead><tbody>
      {waccs.map((wacc) => <tr key={wacc}><th>{fmt.format(wacc)}%</th>{columns.map((column) => {
        const result = calculate(data, model, method, 0, 0, method === "perpetuity" ? { wacc, terminalGrowth: column } : { wacc, exitMultiple: column });
        const active = Math.abs(wacc - model.wacc) < .01 && Math.abs(column - (method === "perpetuity" ? model.terminalGrowth : model.exitMultiple)) < .01;
        const invalid = method === "perpetuity" && wacc <= column;
        return <td className={active ? "active" : ""} key={column}>{invalid ? "—" : usd.format(result.perShare)}</td>;
      })}</tr>)}
    </tbody></table></div>
  </div>;
}

function StockPriceChart({ points, symbol }: { points: PricePoint[]; symbol: string }) {
  type ChartPeriod = "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "MAX";
  type ChartInterval = "1D" | "1W" | "1M";
  const periods: ChartPeriod[] = ["3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX"];
  const intervals: Array<{ value: ChartInterval; label: string; heading: string }> = [
    { value: "1D", label: "Daily", heading: "DAILY" },
    { value: "1W", label: "Weekly", heading: "WEEKLY" },
    { value: "1M", label: "Monthly", heading: "MONTHLY" },
  ];
  const [period, setPeriod] = useState<ChartPeriod>("5Y");
  const [interval, setInterval] = useState<ChartInterval>("1M");
  const sampled = useMemo(() => {
    if (interval === "1D") return points;
    const buckets = new Map<string, PricePoint>();
    for (const point of points) {
      const pointDate = new Date(`${point.date}T00:00:00Z`);
      let key = point.date.slice(0, 7);
      if (interval === "1W") {
        const weekStart = new Date(pointDate);
        weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
        key = weekStart.toISOString().slice(0, 10);
      }
      // Points arrive oldest to newest, so this retains each period's final close.
      buckets.set(key, point);
    }
    return Array.from(buckets.values());
  }, [interval, points]);
  const filtered = useMemo(() => {
    if (!sampled.length || period === "MAX") return sampled;
    const latest = new Date(`${sampled[sampled.length - 1].date}T00:00:00Z`);
    const cutoff = new Date(latest);
    if (period === "YTD") cutoff.setTime(Date.UTC(latest.getUTCFullYear(), 0, 1));
    else if (period === "3M" || period === "6M") cutoff.setUTCMonth(cutoff.getUTCMonth() - (period === "3M" ? 3 : 6));
    else cutoff.setUTCFullYear(cutoff.getUTCFullYear() - (period === "1Y" ? 1 : period === "3Y" ? 3 : 5));
    return sampled.filter((point) => new Date(`${point.date}T00:00:00Z`) >= cutoff);
  }, [period, sampled]);

  if (filtered.length < 2) return <div className="chart-empty">Price history was not returned by Nasdaq for this ticker.</div>;
  const width = 900;
  const height = 330;
  const pad = { left: 68, right: 22, top: 24, bottom: 48 };
  const prices = filtered.map((point) => point.close);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const cushion = Math.max((rawMax - rawMin) * .1, rawMax * .02, 1);
  const min = Math.max(0, rawMin - cushion);
  const max = rawMax + cushion;
  const x = (index: number) => pad.left + index / Math.max(filtered.length - 1, 1) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (max - value) / Math.max(max - min, 1) * (height - pad.top - pad.bottom);
  const line = filtered.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.close).toFixed(1)}`).join(" ");
  const area = `${line} L${x(filtered.length - 1)},${height - pad.bottom} L${x(0)},${height - pad.bottom} Z`;
  const tickIndexes = Array.from(new Set([0, .25, .5, .75, 1].map((ratio) => Math.round((filtered.length - 1) * ratio))));
  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  const change = (last.close / first.close - 1) * 100;
  const dateLabel = (date: string) => new Intl.DateTimeFormat("en-US", ["3M", "6M", "YTD"].includes(period)
    ? { month: "short", day: "numeric", timeZone: "UTC" }
    : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const selectedInterval = intervals.find((item) => item.value === interval) || intervals[2];
  return <div className="price-chart-card">
    <div className="chart-head"><div><span>{symbol} {selectedInterval.heading} CLOSE</span><h3>{usd.format(last.close)} <i className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{fmt.format(change)}%</i></h3></div><div className="chart-controls"><div className="chart-control-row"><span>RANGE</span><div className="period-toggle" role="group" aria-label="Stock-price time range">{periods.map((item) => <button type="button" aria-pressed={item === period} className={item === period ? "active" : ""} key={item} onClick={() => setPeriod(item)}>{item}</button>)}</div></div><div className="chart-control-row"><span>INTERVAL</span><div className="period-toggle interval-toggle" role="group" aria-label="Stock-price observation interval">{intervals.map((item) => <button type="button" aria-pressed={item.value === interval} className={item.value === interval ? "active" : ""} key={item.value} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div></div></div></div>
    <svg className="price-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${symbol} ${selectedInterval.label.toLowerCase()} closing price chart for ${period}`}>
      <defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#78924b" stopOpacity=".28"/><stop offset="1" stopColor="#78924b" stopOpacity="0"/></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((ratio) => { const value = max - (max - min) * ratio; const yPos = y(value); return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={yPos} y2={yPos}/><text x={pad.left - 10} y={yPos + 4} textAnchor="end">{usd0.format(value)}</text></g>; })}
      {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 17} textAnchor={index === 0 ? "start" : index === filtered.length - 1 ? "end" : "middle"}>{dateLabel(filtered[index].date)}</text>)}
      <path className="price-area" d={area}/><path className="price-line" d={line}/>
      <circle cx={x(filtered.length - 1)} cy={y(last.close)} r="4"/>
    </svg>
    <div className="chart-stats"><span>Period low <b>{usd.format(rawMin)}</b></span><span>Period high <b>{usd.format(rawMax)}</b></span><span>Observations <b>{filtered.length} {selectedInterval.label.toLowerCase()} closes</b></span></div>
  </div>;
}

function CompetitorComparison({ data }: { data: CompanyData }) {
  const comparison = data.comparison;
  const company: Comparable = comparison?.company || {
    symbol: data.company.symbol,
    name: data.company.name,
    description: data.company.description,
    sector: data.company.sector,
    industry: data.company.industry,
    marketCap: data.market.marketCap,
    revenueGrowth: data.metrics.revenueGrowth,
    operatingMargin: data.metrics.ebitMargin,
    evToRevenue: null,
    evToEbitda: null,
    pe: null,
  };
  const peers = comparison?.peers || [];
  const formatMetric = (value: number | null, suffix = "×") => value === null || !Number.isFinite(value) ? "—" : `${fmt.format(value)}${suffix}`;
  const formatCap = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : value >= 1000 ? `$${fmt.format(value / 1000)}B` : `$${fmt.format(value)}M`;
  const metrics = {
    growth: peerMedian(data, "revenueGrowth"),
    margin: peerMedian(data, "operatingMargin"),
    marketCap: peerMedian(data, "marketCap"),
    multiple: peerMedian(data, "evToEbitda"),
    revenueMultiple: peerMedian(data, "evToRevenue"),
    pe: peerMedian(data, "pe"),
  };
  const difference = (value: number | null, benchmark: number | null, positive: string, negative: string, gapUnit: string, benchmarkUnit = gapUnit) => {
    if (value === null || benchmark === null) return "Not enough provider data to calculate this comparison.";
    const gap = value - benchmark;
    if (Math.abs(gap) < .05) return `Approximately in line with the peer median of ${fmt.format(benchmark)}${benchmarkUnit}.`;
    return `${fmt.format(Math.abs(gap))}${gapUnit} ${gap > 0 ? positive : negative} the peer median of ${fmt.format(benchmark)}${benchmarkUnit}.`;
  };
  const insights = [
    { label: "Growth", value: formatMetric(company.revenueGrowth, "%"), detail: difference(company.revenueGrowth, metrics.growth, "above", "below", " percentage points", "%") },
    { label: "Operating margin", value: formatMetric(company.operatingMargin, "%"), detail: difference(company.operatingMargin, metrics.margin, "above", "below", " percentage points", "%") },
    { label: "Company scale", value: formatCap(company.marketCap), detail: difference(company.marketCap, metrics.marketCap, "larger than", "smaller than", "M") },
    { label: "EV / EBITDA", value: formatMetric(company.evToEbitda), detail: difference(company.evToEbitda, metrics.multiple, "above", "below", "×") },
  ];
  const assessment = businessAssessment(data, company);
  const rows = peers.length ? [company, ...peers] : [company];
  const fitLabel = (fit: Comparable["peerFit"]) => fit === "direct" ? "DIRECT FIT" : fit === "close" ? "CLOSE FIT" : fit === "adjacent" ? "ADJACENT" : "";
  return <section className="sheet-section" id="competitors">
    <div className="section-heading"><div><span className="section-index">05</span><p>BUSINESS + RELATIVE VALUATION</p><h2>Competitor companies</h2></div><p className="section-description">Peers are selected from a business-model niche—not merely the reported industry label. Direct, close, and adjacent fits are identified so you can judge which valuation comparisons deserve the most weight.</p></div>
    <div className="peer-selection-note"><div><span>SELECTED BUSINESS NICHE</span><strong>{comparison?.nicheLabel || businessFocus(company)}</strong></div><p>{comparison?.selectionBasis || "The closest available public companies are selected using the company description, products, customers, and operating model."}</p>{Boolean(comparison?.operatingCompetitors?.length) && <small>Broader operating competitors—not primary valuation peers: {comparison?.operatingCompetitors?.join(" · ")}</small>}</div>
    <div className="business-review">
      <article><span>WHAT THE COMPANY DOES</span><h3>{comparison?.nicheLabel || businessFocus(company)}</h3><p>{company.description || data.company.description}</p></article>
      <article className="moat-card"><span>DOES IT HAVE A MOAT?</span><h3>{assessment.verdict}</h3><p>{assessment.mechanism} {assessment.financialSignal}</p><small>Verify: {assessment.verify}.</small></article>
      <article><span>HOW THE BUSINESS DIFFERS</span><h3>Business mix matters</h3><p>{assessment.difference}</p></article>
    </div>
    <div className="peer-summary"><div><span>NICHE GROWTH BENCHMARK</span><strong>{comparison?.industryGrowthRate === null || comparison?.industryGrowthRate === undefined ? "—" : `${fmt.format(comparison.industryGrowthRate)}%`}</strong><small>Median recent peer revenue growth</small></div><div><span>PEER MEDIAN EV / EBITDA</span><strong>{metrics.multiple === null ? "—" : `${fmt.format(metrics.multiple)}×`}</strong><small>Reference for the exit-multiple method</small></div><div><span>SELECTED PEER GROUP</span><strong>{(comparison?.selectedPeerSymbols || peers.map((peer) => peer.symbol)).join(" · ") || "Unavailable"}</strong><small>Narrowed by products, customers, and operating model</small></div></div>
    <div className="peer-table-wrap table-scroll"><table className="peer-table"><thead><tr><th>Company</th><th>Business focus</th><th>Market cap</th><th>Revenue growth</th><th>Operating margin</th><th>EV / Revenue</th><th>EV / EBITDA</th><th>P / E</th></tr></thead><tbody>
      {rows.map((peer, index) => <tr className={index === 0 ? "focus-company" : ""} key={peer.symbol}><td><b>{peer.symbol}</b><span>{peer.name}</span>{index === 0 && <em>FOCUS COMPANY</em>}</td><td className="business-focus-cell"><b>{index === 0 ? comparison?.nicheLabel || businessFocus(peer) : businessFocus(peer)}</b>{index > 0 && fitLabel(peer.peerFit) && <em className={`peer-fit ${peer.peerFit}`}>{fitLabel(peer.peerFit)}</em>}{peer.peerRationale && <small>{peer.peerRationale}</small>}</td><td>{formatCap(peer.marketCap)}</td><td>{formatMetric(peer.revenueGrowth, "%")}</td><td>{formatMetric(peer.operatingMargin, "%")}</td><td>{formatMetric(peer.evToRevenue)}</td><td>{formatMetric(peer.evToEbitda)}</td><td>{formatMetric(peer.pe)}</td></tr>)}
      {peers.length > 0 && <tr className="peer-median"><td><b>PEER MEDIAN</b><span>{peers.length} returned companies</span></td><td>—</td><td>{formatCap(metrics.marketCap)}</td><td>{formatMetric(metrics.growth, "%")}</td><td>{formatMetric(metrics.margin, "%")}</td><td>{formatMetric(metrics.revenueMultiple)}</td><td>{formatMetric(metrics.multiple)}</td><td>{formatMetric(metrics.pe)}</td></tr>}
    </tbody></table></div>
    {!peers.length && <div className="peer-empty">Comparable ratios were not returned by Nasdaq for this request. The primary DCF still works because peer data is optional.</div>}
    <h3 className="difference-title">How {company.symbol} differs from the peer median</h3>
    <div className="difference-grid">{insights.map((insight) => <article key={insight.label}><span>{insight.label}</span><strong>{insight.value}</strong><p>{insight.detail}</p></article>)}</div>
    <p className="peer-disclaimer">Revenue growth compares each company’s latest two annual periods. Multiples and margins use the latest displayed annual financials and may not be comparable when earnings are negative, fiscal periods differ, or business mixes vary.</p>
  </section>;
}

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [data, setData] = useState<CompanyData>(demo);
  const [model, setModel] = useState<Model>(() => buildModel(demo));
  const [loading, setLoading] = useState(false);
  const [companyReady, setCompanyReady] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [startingExample, setStartingExample] = useState(LARGE_COMPANY_EXAMPLES[0]);
  const [workbookTab, setWorkbookTab] = useState<WorkbookTab>("dcf");
  const [error, setError] = useState("");
  const rec = useMemo(() => recommendations(data), [data]);
  const perpetuity = useMemo(() => calculate(data, model, "perpetuity"), [data, model]);
  const multiple = useMemo(() => calculate(data, model, "multiple"), [data, model]);
  const result = perpetuity;
  const risks = useMemo(() => riskAnalysis(data, model, perpetuity, multiple), [data, model, perpetuity, multiple]);
  const latest = data.historical[data.historical.length - 1];
  const priceContext = marketPriceContext(data);
  const rotatingExample = LARGE_COMPANY_EXAMPLES[exampleIndex];
  const update = (key: Exclude<keyof Model, "valuationDate">, value: number) => setModel((current) => ({ ...current, [key]: value }));
  const updateValuationDate = (value: string) => setModel((current) => ({ ...current, valuationDate: value }));

  useEffect(() => {
    const previousIndex = sessionStorage.getItem("dcf:example-index");
    const initialIndex = previousIndex === null ? 0 : (Number(previousIndex) + 1) % LARGE_COMPANY_EXAMPLES.length;
    sessionStorage.setItem("dcf:example-index", String(initialIndex));
    setExampleIndex(initialIndex);
    setStartingExample(LARGE_COMPANY_EXAMPLES[initialIndex]);
    void loadCompany(LARGE_COMPANY_EXAMPLES[initialIndex].symbol);
    const rotation = window.setInterval(() => {
      setExampleIndex((current) => (current + 1) % LARGE_COMPANY_EXAMPLES.length);
    }, 3200);
    return () => window.clearInterval(rotation);
  }, []);

  useEffect(() => {
    if (!companyReady) return;
    const serialized = JSON.stringify(data);
    sessionStorage.setItem("dcf:last-company", serialized);
    localStorage.setItem("dcf:last-company", serialized);
  }, [companyReady, data]);

  useEffect(() => {
    if (!companyReady || data.source === "Sample data") return;
    const points = data.market.priceHistory || [];
    if (points.length >= 8 && !hasDailyPriceDensity(points)) {
      // Fast Refresh can preserve the older monthly-only response after the API
      // is upgraded. Refresh that ticker once so Daily and Weekly are real data.
      void loadCompany(data.company.symbol);
    }
  }, [companyReady, data.company.symbol, data.market.priceHistory, data.source]);

  async function loadCompany(symbol: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to load company.");
      setData(json);
      setModel(buildModel(json));
      setCompanyReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load company.");
    } finally {
      setLoading(false);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) {
      setError("Type a ticker symbol to build a DCF.");
      return;
    }
    await loadCompany(symbol);
  }

  const latestCostRevenue = latest?.cogs ?? null;
  const latestGrossProfit = latestCostRevenue === null ? null : data.metrics.revenue - latestCostRevenue;
  const latestOperatingExpenses = latestGrossProfit === null ? null : latestGrossProfit - (latest?.ebit ?? data.metrics.revenue * data.metrics.ebitMargin / 100);
  const tableRows: Array<{ label: string; actual: number | null; values: Array<number | null>; terminal?: number | null; type?: "percent" | "factor" | "total" | "negative" }> = [
    { label: "Revenue", actual: data.metrics.revenue, values: result.years.map((year) => year.revenue) },
    { label: "% YoY Growth", actual: data.metrics.revenueGrowth, values: result.years.map((year) => year.growth), type: "percent" },
    { label: "Less: Cost of Revenue", actual: latestCostRevenue, values: result.years.map((year) => year.costRevenue), type: "negative" },
    { label: "Cost of Revenue / Revenue", actual: latestCostRevenue === null ? null : latestCostRevenue / data.metrics.revenue * 100, values: result.years.map((year) => 100 - year.grossMargin), type: "percent" },
    { label: "Gross Profit", actual: latestGrossProfit, values: result.years.map((year) => year.grossProfit), type: "total" },
    { label: "Gross Margin", actual: latest?.grossMargin ?? null, values: result.years.map((year) => year.grossMargin), type: "percent" },
    { label: "Less: Operating Expenses", actual: latestOperatingExpenses, values: result.years.map((year) => year.operatingExpenses), type: "negative" },
    { label: "Operating Expenses / Revenue", actual: latestOperatingExpenses === null ? null : latestOperatingExpenses / data.metrics.revenue * 100, values: result.years.map((year) => year.operatingExpenses / year.revenue * 100), type: "percent" },
    { label: "Operating Income", actual: latest?.ebit ?? data.metrics.revenue * data.metrics.ebitMargin / 100, values: result.years.map((year) => year.ebit), type: "total" },
    { label: "Operating Margin", actual: data.metrics.ebitMargin, values: result.years.map((year) => year.margin), type: "percent" },
    { label: "Less: Tax on Operating Income", actual: null, values: result.years.map((year) => year.tax), type: "negative" },
    { label: "Operating Tax Rate", actual: null, values: result.years.map((year) => year.taxRate), type: "percent" },
    { label: "NOPAT", actual: null, values: result.years.map((year) => year.nopat), type: "total" },
    { label: "Plus: Depreciation & Amortization", actual: latest?.depreciation ?? data.metrics.revenue * data.metrics.daPercentRevenue / 100, values: result.years.map((year) => year.depreciation) },
    { label: "D&A / Revenue", actual: data.metrics.daPercentRevenue, values: result.years.map((year) => year.daPercent), type: "percent" },
    { label: "Less: Capital Expenditure", actual: latest?.capex ?? data.metrics.revenue * data.metrics.capexPercentRevenue / 100, values: result.years.map((year) => year.capex), type: "negative" },
    { label: "Capex / Revenue", actual: data.metrics.capexPercentRevenue, values: result.years.map((year) => year.capexPercent), type: "percent" },
    { label: "Less: Changes in Net Working Capital", actual: null, values: result.years.map((year) => year.changeNwc), type: "negative" },
    { label: "Changes in NWC / Revenue", actual: null, values: result.years.map((year) => year.nwcPercent), type: "percent" },
    { label: "Plus: Changes in Net Long-Term Deferred Tax Liabilities", actual: null, values: result.years.map((year) => year.deferredTax) },
    { label: "Deferred Tax Change / Revenue", actual: null, values: result.years.map((year) => year.deferredTaxPercent), type: "percent" },
    { label: "Plus: Other Estimated Non-Cash Adjustments", actual: null, values: result.years.map((year) => year.otherNonCash) },
    { label: "Free Cash Flow", actual: latest?.freeCashFlow ?? null, values: result.years.map((year) => year.fcf), terminal: result.terminalFcf, type: "total" },
    { label: "% of FCF Discounted", actual: null, values: result.years.map((year) => year.weight * 100), type: "percent" },
    { label: "Mid-Year Discount Period", actual: null, values: result.years.map((year) => year.discountPeriod), type: "factor" },
    { label: "Discount Factor", actual: null, values: result.years.map((year) => year.discountFactor), type: "factor" },
    { label: "Present Value of Free Cash Flow", actual: null, values: result.years.map((year) => year.pv), terminal: result.pvForecast, type: "total" },
    { label: "EBITDA", actual: latest ? latest.ebit + latest.depreciation : null, values: result.years.map((year) => year.ebitda), terminal: result.terminalEbitda, type: "total" },
  ];
  const formatCell = (value: number | null, type?: string) => {
    if (value === null || !Number.isFinite(value)) return "—";
    if (type === "percent") return `${fmt.format(value)}%`;
    if (type === "factor") return value < 1 ? value.toFixed(3) : fmt.format(value);
    if (type === "negative") return value < 0 ? `(${fmt.format(Math.abs(value))})` : fmt.format(value);
    return fmt.format(value);
  };

  const marketCapitalization = model.marketPrice * model.shares;
  const modelDebt = model.shortDebt + model.longDebt;
  const capital = Math.max(1, marketCapitalization + modelDebt);
  const equityWeight = marketCapitalization / capital;
  const debtWeight = modelDebt / capital;
  const beta = data.market.beta || 1;
  const riskFree = 4.5;
  const equityRiskPremium = 5;
  const costEquity = riskFree + beta * equityRiskPremium;
  const priorDebt = data.historical.length > 1 ? data.historical[data.historical.length - 2].debt : null;
  const averageDebt = priorDebt && latest?.debt ? (priorDebt + latest.debt) / 2 : latest?.debt || modelDebt;
  const observedCostOfDebt = latest?.interestExpense && averageDebt ? latest.interestExpense / averageDebt * 100 : null;
  const preTaxDebt = observedCostOfDebt && Number.isFinite(observedCostOfDebt) ? clamp(observedCostOfDebt, 3, 20) : 6;
  const referenceWacc = costEquity * equityWeight + preTaxDebt * (1 - model.tax / 100) * debtWeight;
  const afterTaxDebt = preTaxDebt * (1 - model.tax / 100);
  const workbookFormula: Record<WorkbookTab, string> = {
    dcf: "UFCF = EBIT × (1 − Tax Rate) + D&A − Capex − ΔNWC",
    assumptions: "Blue cells link to the editable inputs below the workbook",
    wacc: "WACC = E/(D+E) × Cost of Equity + D/(D+E) × Pre-tax Cost of Debt × (1−Tax Rate)",
    valuation: "Equity Value = Enterprise Value + Cash − Debt − Other Non-Equity Claims",
    sensitivity: "Implied Share Price = Equity Value ÷ Fully Diluted Shares",
  };
  const assumptionSheet = [
    ["Valuation date", model.valuationDate, "Current date; editable"],
    ["Year 1 revenue growth", `${fmt.format(result.years[0].growth)}%`, data.forecast ? data.forecast.source : "Historical-growth fallback"],
    ["Year 2 revenue growth", `${fmt.format(result.years[1].growth)}%`, data.forecast ? data.forecast.source : "Modeled fade"],
    ["Years 3–6 revenue growth", result.years.slice(2).map((year) => `${fmt.format(year.growth)}%`).join(" · "), "Website maturity fade; editable through starting growth"],
    ["Target EBIT margin", `${fmt.format(model.margin)}%`, "Industry starting point; editable"],
    ["Tax rate", `${fmt.format(model.tax)}%`, "Normalized operating tax assumption"],
    ["Target D&A / revenue", `${fmt.format(model.da)}%`, "Reinvestment assumption; editable"],
    ["Target capex / revenue", `${fmt.format(model.capex)}%`, "Reinvestment assumption; editable"],
    ["NWC / incremental revenue", `${fmt.format(model.nwc)}%`, "Operating working-capital assumption"],
    ["Selected WACC", `${fmt.format(model.wacc)}%`, "Risk-adjusted model input; compare with WACC sheet"],
    ["Perpetual growth", `${fmt.format(model.terminalGrowth)}%`, "Must remain below WACC"],
    ["Exit EBITDA multiple", `${fmt.format(model.exitMultiple)}×`, "Compare with niche peers"],
    ["Cash & included investments", `${usd0.format(model.cash)}M`, "Latest available balance-sheet proxy"],
    ["Debt", `${usd0.format(model.shortDebt + model.longDebt)}M`, "Short-term plus long-term funded debt"],
    ["Other non-equity claims", `${usd0.format(model.preferredInterest)}M`, "Preferred stock, leases, and minority interest input"],
    ["Share count used", `${fmt.format(model.shares)}M`, "Market-cap-derived proxy; verify full dilution"],
  ];
  const valuationSheet = [
    ["Terminal value at Year 5", perpetuity.terminalValue, multiple.terminalValue],
    ["PV of explicit forecast UFCF", perpetuity.pvForecast, multiple.pvForecast],
    ["PV of terminal value", perpetuity.pvTerminal, multiple.pvTerminal],
    ["Enterprise value", perpetuity.enterpriseValue, multiple.enterpriseValue],
    ["Plus: cash & included investments", model.cash, model.cash],
    ["Less: short-term debt", -model.shortDebt, -model.shortDebt],
    ["Less: long-term debt", -model.longDebt, -model.longDebt],
    ["Less: other non-equity claims", -model.preferredInterest, -model.preferredInterest],
    ["Equity value", perpetuity.equityValue, multiple.equityValue],
  ];
  const workbookMoney = (value: number) => value < 0 ? `(${usd0.format(Math.abs(value))}M)` : `${usd0.format(value)}M`;
  return <main>
    <nav className="top-nav"><a href="#top" className="brand">DCF CALCULATOR</a><span>Interactive valuation workbook</span></nav>
    <header id="top" className="calculator-header">
      <p>DISCOUNTED CASH FLOW</p>
      <h1>DCF Calculator</h1>
      <div className="instructions"><b>Instructions</b><span>Enter a public-company ticker below. The calculator follows the Bloomberg XDCF structure: six calendar-year operating forecasts, a five-year mid-year-convention valuation, and separate perpetuity and EBITDA-multiple outputs.</span></div>
      <form className="ticker-search" onSubmit={search}><label><span>TICKER SYMBOL</span><input aria-label="Ticker symbol" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder={`Type a ticker — try ${rotatingExample.symbol}`} /></label><button disabled={loading || !ticker.trim()}>{loading ? companyReady ? "BUILDING DCF…" : "LOADING EXAMPLE…" : "BUILD DCF →"}</button></form>
      {error && <div className="api-error"><b>Data connection:</b> {error}</div>}
      <small>Rotating ticker idea: {rotatingExample.name} ({rotatingExample.symbol}) · The supplied Bloomberg sheet defines the calculation process only. Current public data and visible, editable estimates populate each ticker.</small>
    </header>

    {!companyReady ? <section className="example-loader" aria-live="polite"><span>LOADING A REAL-COMPANY EXAMPLE</span><h2>{startingExample.name} · {startingExample.symbol}</h2><p>The calculator opens with a current large-company example. Type any supported public-company ticker above when you are ready.</p></section> : <>
    <section className="company-summary">
      <div><span>{data.company.exchange} · {data.company.symbol}</span><h2>{data.company.name}</h2><b className="company-description-label">{data.source === "Sample data" ? "WHAT THE COMPANY DOES · SAMPLE" : `WHAT THE COMPANY DOES · ${data.company.descriptionSource || "COMPANY PROFILE"}`}</b><p>{briefDescription(data.company.description)}</p><Link className="deep-analysis-link" href={`/company-analysis?symbol=${encodeURIComponent(data.company.symbol)}`}>{data.source === "Sample data" ? "Open sample supply chain, customer concentration & default-risk analysis →" : "Open SEC supply chain, customer concentration & default-risk analysis →"}</Link></div>
      <dl><div><dt>{priceContext.label}</dt><dd>{usd.format(model.marketPrice)}<small>{priceContext.detail}</small></dd></div><div><dt>Business niche</dt><dd>{data.comparison?.nicheLabel || data.company.industry}<small>{data.comparison?.industryExplanation || `Reported industry: ${data.company.industry}`}</small></dd></div><div><dt>Financials through</dt><dd>{data.asOf}</dd></div><div><dt>Company data source</dt><dd>{data.source}</dd></div></dl>
    </section>

    <section className="sheet-section" id="valuation">
      <div className="section-heading"><div><span className="section-index">01</span><p>OUTPUT</p><h2>DCF valuation</h2></div><div className="unit-note">BOTH TERMINAL METHODS SHOWN TOGETHER</div></div>
      <div className="valuation-cards"><div><span>{priceContext.label}</span><strong>{usd.format(model.marketPrice)}</strong><small>{priceContext.detail}</small></div><div><span><DefinedTerm term="perpetualGrowth">Perpetual growth</DefinedTerm> value</span><strong>{usd.format(perpetuity.perShare)}</strong><ValueMove value={perpetuity.perShare} price={model.marketPrice}/></div><div><span><DefinedTerm term="exitMultiple">Exit multiple</DefinedTerm> value</span><strong>{usd.format(multiple.perShare)}</strong><ValueMove value={multiple.perShare} price={model.marketPrice}/></div></div>
      <div className="negative-explainer bloomberg-reference"><b>BLOOMBERG XDCF PROCESS · CURRENT PUBLIC INPUTS</b><p>The model copies the PDF’s six calendar-year forecast layout, exact five-year weighting, mid-year discounting, Year-5 interpolation, terminal formulas, and enterprise-to-equity bridge. It does not copy the PDF’s CRWV forecasts, date, price, WACC, growth rate, multiple, debt, cash, shares, or published answer.</p></div>
      {model.wacc <= model.terminalGrowth && <div className="api-error valuation-warning"><b>Assumption error:</b> WACC must be greater than terminal growth for the perpetual-growth method.</div>}
      {(model.terminalGrowth < 2 || model.terminalGrowth > 4) && <div className="api-error valuation-warning"><b>Terminal-growth review:</b> Wall Street Prep describes roughly 2%–4% as a typical mature-company range. A value outside that range can be valid, but it needs company-specific support.</div>}
      {(perpetuity.rawEquityValue < 0 || multiple.rawEquityValue < 0) && <div className="negative-explainer"><b>WHY A METHOD CAN SHOW $0 FOR COMMON EQUITY</b><p>Under at least one terminal method, enterprise value plus cash does not cover funded debt. The mathematical bridge is negative, but common stock has limited liability, so the displayed value stops at $0 rather than showing a negative share price.</p></div>}
      <div className="bridge-grid"><ValuationBridge title="Perpetual Growth Method" result={perpetuity} model={model} method="perpetuity" data={data}/><ValuationBridge title="Exit Multiple Method" result={multiple} model={model} method="multiple" data={data}/></div>
    </section>

    <section className="sheet-section" id="build">
      <div className="section-heading"><div><span className="section-index">02</span><p>MODEL</p><h2>DCF workbook</h2></div><div className="unit-note">USD IN MILLIONS · LIVE TICKER-LINKED CELLS</div></div>
      <div className="method-audit">
        <div className="audit-heading"><div><span>PROCESS CHECK</span><h3>Wall Street Prep six-step unlevered DCF</h3></div><a href={WSP_DCF_GUIDE} target="_blank" rel="noreferrer">Review source framework ↗</a></div>
        <div className="six-step-grid">
          <article><span>01</span><b>Forecast UFCF</b><code>EBIT × (1−T) + D&A − Capex − ΔNWC</code></article>
          <article><span>02</span><b>Calculate terminal value</b><code>Perpetuity or Exit EBITDA</code></article>
          <article><span>03</span><b>Discount at WACC</b><code>PV of UFCF + PV of terminal value</code></article>
          <article><span>04</span><b>Add non-operating assets</b><code>Enterprise value + cash & investments</code></article>
          <article><span>05</span><b>Subtract non-equity claims</b><code>Debt + leases + preferred + minority</code></article>
          <article><span>06</span><b>Calculate value per share</b><code>Equity value ÷ fully diluted shares</code></article>
        </div>
        <p><b>Scope check:</b> This is an automated quick DCF, not a fully linked three-statement model. Wall Street Prep says high-stakes forecasts should ideally link EBIT, D&A, capex, and working capital through all three statements. Every modeled shortcut remains visible and editable here.</p>
      </div>
      <div className="workbook-shell">
        <div className="formula-bar"><b>fx</b><code>{workbookFormula[workbookTab]}</code></div>
        <div className="workbook-panel" role="tabpanel" aria-label={`${workbookTab} worksheet`}>
          {workbookTab === "dcf" && <div className="model-table-wrap"><table className="model-table"><thead><tr><th>DCF line item</th><th className="actual">{latest?.year || "Latest"} A</th>{result.years.map((year) => <th key={year.year}>DEC {String(year.year).slice(-2)} E</th>)}<th>YEAR 5</th></tr></thead><tbody>
            {tableRows.map((row) => <tr className={`${row.type === "total" ? "total" : ""} ${row.type === "percent" ? "percent-row" : ""}`} key={row.label}><td><DcfRowLabel label={row.label}/></td><td className="actual">{formatCell(row.actual, row.type)}</td>{row.values.map((value, index) => <td key={index}>{formatCell(value, row.type)}</td>)}<td>{formatCell(row.terminal ?? null, row.type)}</td></tr>)}
          </tbody></table></div>}
          {workbookTab === "assumptions" && <div className="model-table-wrap"><table className="workbook-table"><thead><tr><th>Assumption</th><th>Linked value</th><th>Source / treatment</th></tr></thead><tbody>{assumptionSheet.map(([label, value, source]) => <tr key={label}><td>{label}</td><td className="linked-cell">{value}</td><td>{source}</td></tr>)}</tbody></table></div>}
          {workbookTab === "wacc" && <div className="model-table-wrap"><table className="workbook-table"><thead><tr><th>WACC component</th><th>Value</th><th>Formula / source check</th></tr></thead><tbody>
            <tr><td>Risk-free rate</td><td className="linked-cell">{fmt.format(riskFree)}%</td><td>Illustrative long-term government-bond proxy; refresh manually</td></tr>
            <tr><td>Beta</td><td className="linked-cell">{fmt.format(beta)}×</td><td>Systematic equity-risk sensitivity</td></tr>
            <tr><td>Equity risk premium</td><td className="linked-cell">{fmt.format(equityRiskPremium)}%</td><td>Illustrative expected equity return above the risk-free rate; refresh manually</td></tr>
            <tr><td>Cost of equity</td><td>{fmt.format(costEquity)}%</td><td>Risk-free rate + Beta × ERP</td></tr>
            <tr><td>Equity weight</td><td>{fmt.format(equityWeight * 100)}%</td><td>Market equity ÷ (market equity + debt)</td></tr>
            <tr><td>Pre-tax cost of debt proxy</td><td className="linked-cell">{fmt.format(preTaxDebt)}%</td><td>{observedCostOfDebt ? "Trailing interest ÷ average debt proxy" : "Fallback because a forward borrowing rate was unavailable"}</td></tr>
            <tr><td>After-tax cost of debt</td><td>{fmt.format(afterTaxDebt)}%</td><td>Pre-tax cost of debt × (1 − tax rate)</td></tr>
            <tr><td>Debt weight</td><td>{fmt.format(debtWeight * 100)}%</td><td>Debt ÷ (market equity + debt)</td></tr>
            <tr className="workbook-total"><td>Formula WACC cross-check</td><td>{fmt.format(referenceWacc)}%</td><td>Equity-weighted cost + debt-weighted after-tax cost</td></tr>
            <tr className="workbook-answer"><td>Selected model WACC</td><td className="linked-cell">{fmt.format(model.wacc)}%</td><td>Editable risk-adjusted assumption used to discount UFCF</td></tr>
          </tbody></table><p className="workbook-warning">For a transaction-grade WACC, replace the debt-cost proxy with forward yield-to-maturity, a current borrowing rate, or a credit-spread estimate. Historical interest expense is only a fallback cross-check.</p></div>}
          {workbookTab === "valuation" && <div className="model-table-wrap"><table className="workbook-table valuation-workbook"><thead><tr><th>Valuation bridge</th><th>Perpetual growth</th><th>Exit multiple</th></tr></thead><tbody>{valuationSheet.map(([label, perpetuityValue, multipleValue]) => <tr className={["Enterprise value", "Equity value"].includes(String(label)) ? "workbook-total" : ""} key={String(label)}><td>{label}</td><td>{workbookMoney(Number(perpetuityValue))}</td><td>{workbookMoney(Number(multipleValue))}</td></tr>)}<tr><td>Share count used</td><td>{fmt.format(model.shares)}M</td><td>{fmt.format(model.shares)}M</td></tr><tr className="workbook-answer"><td>Implied value per share</td><td>{usd.format(perpetuity.perShare)}</td><td>{usd.format(multiple.perShare)}</td></tr></tbody></table><p className="workbook-warning">The share-count default is a free-data proxy. Wall Street Prep’s Step 6 requires current shares plus options, warrants, restricted stock, convertibles, and other dilutive securities.</p></div>}
          {workbookTab === "sensitivity" && <div className="sensitivity-grid workbook-sensitivity"><SensitivityTable data={data} model={model} method="perpetuity"/><SensitivityTable data={data} model={model} method="multiple"/></div>}
        </div>
        <div className="workbook-tabs" role="tablist" aria-label="DCF workbook sheets">{([
          ["dcf", "DCF Model"], ["assumptions", "Assumptions"], ["wacc", "WACC"], ["valuation", "Valuation"], ["sensitivity", "Sensitivity"],
        ] as Array<[WorkbookTab, string]>).map(([tab, label]) => <button type="button" role="tab" aria-selected={workbookTab === tab} className={workbookTab === tab ? "active" : ""} key={tab} onClick={() => setWorkbookTab(tab)}>{label}</button>)}</div>
      </div>
      <p className="table-footnote">The workbook follows Wall Street Prep’s six-step unlevered DCF and retains the Bloomberg PDF’s exact five-year, partial-year, mid-year discounting mechanics. The formulas are audited; forecast accuracy still depends on the visible assumptions and data quality.</p>
    </section>

    <section className="sheet-section" id="assumptions">
      <div className="section-heading"><div><span className="section-index">03</span><p>INPUTS</p><h2>Editable assumptions</h2></div><div className="unit-note">GREEN CELLS ARE EDITABLE</div></div>
      <div className="recommendation"><b>{data.comparison?.nicheLabel || data.company.industry} starting point</b><p>{rec.note}</p>{data.forecast ? <span>Forecast coverage: Years 1–2 use {usd0.format(data.forecast.year1Revenue)}M and {usd0.format(data.forecast.year2Revenue)}M from <a href={data.forecast.sourceUrl} target="_blank" rel="noreferrer">{data.forecast.source}</a>{data.forecast.asOf ? ` as of ${data.forecast.asOf}` : ""}. Years 3–6 are website estimates that fade growth geometrically toward maturity; they are not Bloomberg consensus.</span> : <span>{data.comparison?.industryGrowthRate === null || data.comparison?.industryGrowthRate === undefined ? "Niche-peer growth was unavailable. " : `Observed niche-peer revenue growth: ${fmt.format(data.comparison.industryGrowthRate)}%. `}All six forecast years use the visible historical-growth fallback because a validated analyst forecast was unavailable.</span>}</div>
      <div className="assumption-grid">
        <DateField value={model.valuationDate} help="Sets the start of the exact five-year valuation window. It changes the partial weighting of the first and sixth calendar-year forecasts, just as in the Bloomberg PDF." onChange={updateValuationDate}/>
        <NumberField label="Starting revenue growth" term="revenueGrowth" value={model.growth} suffix="%" help={data.forecast ? `Year 1 sales growth. The default is the current analyst-consensus estimate; editing it also adjusts the Year 2 anchor before growth fades toward maturity.` : "Year 1 sales growth used to populate the Bloomberg-format forecast rows."} onChange={(value) => update("growth", value)}/>
        <NumberField label="Target EBIT margin" term="ebitMargin" value={model.margin} suffix="%" help="Operating margin reached in the later forecast rows." onChange={(value) => update("margin", value)}/>
        <NumberField label="Tax rate" term="taxRate" value={model.tax} suffix="%" help="Normalized operating tax rate used in NOPAT = EBIT × (1 − tax rate). For loss-making companies, confirm whether tax losses can actually be used before relying on the modeled tax benefit." onChange={(value) => update("tax", value)}/>
        <NumberField label="Target D&A / revenue" term="da" value={model.da} suffix="%" help="Normalized depreciation and amortization as a share of revenue in later forecast rows." onChange={(value) => update("da", value)}/>
        <NumberField label="Target capex / revenue" term="capex" value={model.capex} suffix="%" help="Normalized capital expenditure as a share of revenue in later forecast rows." onChange={(value) => update("capex", value)}/>
        <NumberField label="NWC / new revenue" term="nwc" value={model.nwc} suffix="%" help="Working capital investment applied to incremental revenue in each modeled forecast row." onChange={(value) => update("nwc", value)}/>
        <NumberField label="WACC" term="wacc" value={model.wacc} suffix="%" help="Required return for debt and equity capital. It discounts forecast cash flows." onChange={(value) => update("wacc", value)}/>
        <NumberField label="Terminal growth" term="terminalGrowth" value={model.terminalGrowth} suffix="%" help="Long-run growth after Year 5. It must remain below WACC." onChange={(value) => update("terminalGrowth", value)}/>
        <NumberField label="Exit EBITDA multiple" term="exitMultiple" value={model.exitMultiple} suffix="×" help="Year 5 EBITDA valuation multiple used in the exit-multiple method." onChange={(value) => update("exitMultiple", value)}/>
        <NumberField label="Market price used for comparison" term="marketPrice" value={model.marketPrice} suffix="$" help={`${priceContext.detail}. This input only calculates upside or downside; it does not change intrinsic value.`} onChange={(value) => update("marketPrice", value)}/>
        <NumberField label="Cash" term="cash" value={model.cash} suffix="$M" help="Available cash added in the enterprise-to-equity bridge." onChange={(value) => update("cash", value)}/>
        <NumberField label="Short-term debt" term="fundedDebt" value={model.shortDebt} suffix="$M" help="Current borrowings subtracted in the Bloomberg enterprise-to-equity bridge." onChange={(value) => update("shortDebt", value)}/>
        <NumberField label="Long-term debt" term="fundedDebt" value={model.longDebt} suffix="$M" help="Non-current borrowings subtracted in the Bloomberg enterprise-to-equity bridge." onChange={(value) => update("longDebt", value)}/>
        <NumberField label="Leases, preferred & minority" term="fundedDebt" value={model.preferredInterest} suffix="$M" help="Other non-equity claims subtracted after funded debt. Include material capital leases, preferred stock, and non-controlling interests that are not already captured in debt." onChange={(value) => update("preferredInterest", value)}/>
        <NumberField label="Share count used" term="dilutedShares" value={model.shares} suffix="M" help="The free-data default is market capitalization divided by share price, not a verified fully diluted count. Wall Street Prep's process requires current shares plus options, warrants, restricted stock, and other dilution; replace this proxy when filing-level dilution is available." onChange={(value) => update("shares", value)}/>
      </div>
      <div className="assumption-bottom"><div className="wacc-table"><div className="sheet-bar"><DefinedTerm term="wacc">WACC</DefinedTerm> formula cross-check</div><div><span><DefinedTerm term="riskFreeRate">Risk-free rate</DefinedTerm></span><b>{fmt.format(riskFree)}%</b></div><div><span><DefinedTerm term="beta">Beta</DefinedTerm></span><b>{fmt.format(beta)}×</b></div><div><span><DefinedTerm term="equityRiskPremium">Equity risk premium</DefinedTerm></span><b>{fmt.format(equityRiskPremium)}%</b></div><div><span><DefinedTerm term="costOfEquity">Implied cost of equity</DefinedTerm></span><b>{fmt.format(costEquity)}%</b></div><div><span><DefinedTerm term="equityWeight">Equity / capital</DefinedTerm></span><b>{fmt.format(equityWeight * 100)}%</b></div><div><span><DefinedTerm term="preTaxCostOfDebt">Pre-tax cost of debt</DefinedTerm></span><b>{fmt.format(preTaxDebt)}%</b></div><div><span><DefinedTerm term="debtWeight">Debt / capital</DefinedTerm></span><b>{fmt.format(debtWeight * 100)}%</b></div><div className="total"><span>Formula reference <DefinedTerm term="wacc">WACC</DefinedTerm></span><b>{fmt.format(referenceWacc)}%</b></div><small>{observedCostOfDebt ? "Pre-tax debt cost uses trailing interest expense divided by average debt as a fallback proxy. " : "A 6% fallback debt cost is used because a reliable observed rate was unavailable. "}For a transaction-grade model, use forward yield-to-maturity, a current borrowing rate, or a credit-spread estimate and refresh the risk-free rate and equity risk premium. The editable model WACC can also include additional size, country, concentration, and execution risk.</small></div>
        <div className="data-check"><div className="sheet-bar">Data checks</div><ul>{(data.qualityNotes?.length ? data.qualityNotes : ["Sample data is active. Enter a ticker to load current public-company data."]).map((note) => <li key={note}>{note}</li>)}</ul></div>
      </div>
    </section>

    <section className="sheet-section" id="price-history">
      <div className="section-heading"><div><span className="section-index">04</span><p>MARKET DATA</p><h2>Stock price history</h2></div><p className="section-description">{data.source === "Sample data" ? "This is an illustrative company, so it does not have a real IPO date." : data.company.ipoDate ? `${data.company.name} first traded publicly on ${longDate(data.company.ipoDate)}.` : `A reliable public-market debut date was not available for ${data.company.name}.`} Select a time range and switch between daily, weekly, or monthly closing prices.</p></div>
      <StockPriceChart points={data.market.priceHistory || []} symbol={data.company.symbol}/>
    </section>

    <CompetitorComparison data={data}/>

    <section className="sheet-section" id="risks">
      <div className="section-heading"><div><span className="section-index">06</span><h2>Potential risks</h2></div><p className="section-description">Each card explains the available evidence, what the risk means for the business, and how it could affect the DCF. Verify material risks in company filings.</p></div>
      <div className="risk-grid">{risks.map((risk) => <article key={risk.title}><span className={`risk-pill ${risk.level}`}>{risk.level}</span><h3>{risk.title}</h3><p>{risk.detail}</p></article>)}</div>
      <div className="decision-checklist"><h3>Investment-decision checklist</h3><ul><li>Read the latest annual report, risk factors, and management guidance.</li><li>Map revenue, suppliers, and operations by country.</li><li>Compare assumptions with direct peers and a full business cycle.</li><li>Stress-test dilution, acquisitions, regulation, and refinancing.</li><li>Define the evidence that would invalidate the thesis.</li><li>Require a margin of safety appropriate for forecast uncertainty.</li></ul></div>
    </section>

    <footer><span>Educational decision support only—not personalized investment advice.</span><span>MODEL V2 · DATA MAY BE DELAYED</span></footer>
    </>}
  </main>;
}
