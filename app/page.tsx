"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import CompanyNews from "@/app/components/company-news";
import { buildBusinessComparison } from "@/lib/business-comparison";
import { actualFiscalLabel, historicalEffectiveTaxRate, historicalRevenueGrowth, historicalUfcf } from "@/lib/historical-dcf";
import {
  addYears,
  calculateDcf,
  calculateWacc,
  fiscalPeriodLabel,
  isStandardDcfUnsupported,
  localValuationDate,
  type DcfMethod,
  type DcfModel,
  type ForecastDriver,
} from "@/lib/dcf-engine";
import { betaCoveragePremium } from "@/lib/valuation-inputs";

type PricePoint = { date: string; close: number };
type HistoricalRow = {
  year: string;
  fiscalDate?: string;
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
  incomeTax?: number;
  earningsBeforeTax?: number;
  netIncome?: number;
  cogs?: number;
  grossMargin?: number;
  shortDebt?: number;
  longDebt?: number;
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
  market: { marketCap: number; shares: number; sharesSource?: string; estimatedPrice: number; priceDate?: string | null; priceBasis?: string; beta: number; betaSource?: string; riskFreeRate?: number; riskFreeAsOf?: string; equityRiskPremium?: number; erpAsOf?: string; marketInputsSource?: string; priceHistory?: PricePoint[] };
  metrics: { revenueGrowth: number; revenue: number; ebitMargin: number; capexPercentRevenue: number; daPercentRevenue: number; cash: number; debt: number; shortDebt?: number; longDebt?: number; preferredInterest?: number; taxRate: number };
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
type Model = DcfModel;
type Method = DcfMethod;
type WorkbookTab = "dcf" | "assumptions" | "wacc" | "valuation" | "sensitivity";
type ResearchView = "comps" | "pitch";
type RiskItem = { level: "high" | "medium" | "low"; title: string; detail: string };

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
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "WMT", name: "Walmart" },
  { symbol: "XOM", name: "Exxon Mobil" },
];
const industryRules = [
  { match: /AI-native GPU cloud|data-center ownership|data center/i, multiple: 12, wacc: 11, terminal: 2.5, margin: 22, da: 18, capex: 22, note: "AI infrastructure can grow quickly, but GPU obsolescence, power availability, utilization, customer concentration, and heavy financing needs justify a high discount rate and substantial continuing reinvestment." },
  { match: /consumer devices and digital ecosystems/i, multiple: 15, wacc: 9, terminal: 3, margin: 25, note: "Consumer ecosystems can combine hardware, services, and switching costs. Forecast the mix explicitly and compare the multiple with other diversified platform companies." },
  { match: /electronic design automation/i, multiple: 20, wacc: 9, terminal: 3, margin: 30, note: "EDA revenue can be recurring and workflow-embedded, but the model should reflect semiconductor cycles, acquisition effects, and stock-based compensation." },
  { match: /diversified public-cloud/i, multiple: 17, wacc: 9, terminal: 3, margin: 25, note: "Diversified cloud platforms mix infrastructure, software, advertising, devices, and other businesses. Segment mix and reinvestment matter more than one blended headline multiple." },
  { match: /software|internet|semiconductor|technology/i, multiple: 18, wacc: 9.5, terminal: 3, margin: 22, note: "Technology can support strong margins, but infrastructure-heavy companies require more reinvestment than asset-light software." },
  { match: /biotech|pharma|health/i, multiple: 14, wacc: 10, terminal: 2.5, margin: 18, note: "Pipeline, patent, reimbursement, and regulatory outcomes can dominate historical trends." },
  { match: /oil|gas|energy|mining/i, multiple: 7, wacc: 10, terminal: 1.5, margin: 15, note: "Commodity cycles and reserve replacement make normalized margins more useful than a single recent year." },
  { match: /utility|telecom/i, multiple: 8, wacc: 7.5, terminal: 2, margin: 18, note: "Stable demand can support lower discount rates, while leverage and capital intensity constrain flexibility." },
  { match: /retail|consumer|restaurant/i, multiple: 10, wacc: 9, terminal: 2.5, margin: 12, note: "Brand strength, same-store growth, input costs, and consumer cycles are the key drivers." },
  { match: /industrial|manufactur|aerospace|transport/i, multiple: 9, wacc: 9, terminal: 2.25, margin: 15, note: "Backlogs and operating leverage help visibility, but cyclicality and capital spending increase downside risk." },
];

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const pct2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
const validMean = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};
const peerMedian = (data: CompanyData, key: keyof Pick<Comparable, "marketCap" | "revenueGrowth" | "operatingMargin" | "evToRevenue" | "evToEbitda" | "pe">) => validMedian((data.comparison?.peers || []).map((peer) => peer[key]));
const peerMean = (data: CompanyData, key: keyof Pick<Comparable, "marketCap" | "revenueGrowth" | "operatingMargin" | "evToRevenue" | "evToEbitda" | "pe">) => validMean((data.comparison?.peers || []).map((peer) => peer[key]));

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
    { match: /retail|restaurant|consumer (?:product|brand|goods|electronics)/i, score: 1, mechanism: "Brand, distribution, customer habits, or purchasing scale can support an advantage, but those benefits are not automatic.", verify: "repeat purchasing, price premiums, store economics, and market-share stability" },
    { match: /bank|financial|payment/i, score: 1, mechanism: "Low-cost funding, trusted distribution, network effects, or regulatory scale may provide an advantage.", verify: "funding costs, customer retention, credit performance, and incremental returns on capital" },
    { match: /biotech|pharma|therapeutic/i, score: 1, mechanism: "Patents and clinical differentiation can create temporary exclusivity, but the advantage may expire or fail with the pipeline.", verify: "patent life, clinical outcomes, reimbursement, pipeline depth, and competing treatments" },
  ];
  const rule = moatRules.find((item) => item.match.test(text));
  const medianMargin = peerMedian(data, "operatingMargin");
  const marginPremium = company.operatingMargin !== null && medianMargin !== null ? company.operatingMargin - medianMargin : null;
  const verdict = rule ? "Potential advantage—requires evidence" : "No specific advantage identified";
  const financialSignal = marginPremium === null
    ? "Peer margin evidence was unavailable."
    : marginPremium > 3
      ? `Its operating margin is ${fmt.format(marginPremium)} percentage points above the peer median. That is context, not proof of pricing power or durability.`
      : marginPremium < -3
        ? `Its operating margin is ${fmt.format(Math.abs(marginPremium))} percentage points below the peer median, so the current numbers do not show peer-leading economics.`
        : "Its operating margin is close to the peer median, so the current numbers alone do not establish pricing power.";
  return {
    verdict,
    mechanism: rule?.mechanism || "The provider description and financial ratios do not reveal a specific durable competitive advantage.",
    verify: rule?.verify || "customer retention, pricing power, market share, returns on invested capital, and credible substitutes",
    financialSignal,
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
  return { ...rule, growth: Math.round(clamp(growth, -30, 200) * 10) / 10, margin: Math.round(margin * 10) / 10, da: Math.round(da * 10) / 10, capex: Math.round(capex * 10) / 10, companyRiskPremium: 0 };
}

function buildModel(data: CompanyData): Model {
  const rec = recommendations(data);
  const latest = data.historical[data.historical.length - 1];
  const fiscalDate = latest?.fiscalDate || data.asOf;
  const yearOneGrowth = data.forecast?.year1Growth ?? rec.growth;
  const yearTwoGrowth = data.forecast?.year2Growth ?? Math.max(rec.terminal + 1, yearOneGrowth * .75);
  const matureExplicitGrowth = clamp(Math.min(Math.max(yearTwoGrowth * .45, rec.terminal + 1), 10), rec.terminal + .5, 12);
  const latestGrossMargin = latest?.grossMargin ?? (latest?.cogs !== undefined && latest.revenue ? (latest.revenue - latest.cogs) / latest.revenue * 100 : Math.max(rec.margin + 12, 30));
  const startingDa = clamp(data.metrics.daPercentRevenue || rec.da, 0, 100);
  const startingCapex = clamp(data.metrics.capexPercentRevenue || rec.capex, 0, 300);
  const forecastDrivers: ForecastDriver[] = Array.from({ length: 6 }, (_, index) => {
    let revenueGrowth = yearOneGrowth;
    if (index === 1) revenueGrowth = yearTwoGrowth;
    if (index >= 2) {
      const progress = (index - 1) / 4;
      revenueGrowth = yearTwoGrowth > 0 && matureExplicitGrowth > 0
        ? yearTwoGrowth * Math.pow(matureExplicitGrowth / yearTwoGrowth, progress)
        : yearTwoGrowth + (matureExplicitGrowth - yearTwoGrowth) * progress;
    }
    const operatingProgress = Math.min(1, (index + 1) / 5);
    const reinvestmentProgress = index / 5;
    const fadeReinvestment = (start: number, target: number) => start > 0 && target > 0
      ? start * Math.pow(target / start, reinvestmentProgress)
      : start + (target - start) * reinvestmentProgress;
    const ebitMargin = data.metrics.ebitMargin + (rec.margin - data.metrics.ebitMargin) * operatingProgress;
    const grossMargin = clamp(latestGrossMargin + (Math.max(latestGrossMargin, rec.margin + 10) - latestGrossMargin) * operatingProgress, ebitMargin, 95);
    return {
      periodEnd: addYears(fiscalDate, index + 1),
      source: index < 2 && data.forecast ? data.forecast.source : "Editable model estimate—not analyst consensus",
      revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      grossMargin: Math.round(grossMargin * 10) / 10,
      ebitMargin: Math.round(ebitMargin * 10) / 10,
      taxRate: data.metrics.taxRate || 21,
      daPercent: Math.round(fadeReinvestment(startingDa, rec.da) * 10) / 10,
      capexPercent: Math.round(fadeReinvestment(startingCapex, rec.capex) * 10) / 10,
      changeNwcPercent: Math.round((2 * revenueGrowth / Math.max(100 + revenueGrowth, 1)) * 10) / 10,
      deferredTaxPercent: 0,
      otherNonCashPercent: 0,
    };
  });
  const priorDebt = data.historical.length > 1 ? data.historical[data.historical.length - 2].debt : null;
  const latestDebt = latest?.debt || data.metrics.debt;
  const averageDebt = priorDebt && latestDebt ? (priorDebt + latestDebt) / 2 : latestDebt;
  const observedCostDebt = latest?.interestExpense && averageDebt ? latest.interestExpense / averageDebt * 100 : null;
  const baseModel: Model = {
    forecastDrivers,
    normalizedTaxRate: data.metrics.taxRate || 21,
    riskFreeRate: data.market.riskFreeRate ?? 4.5,
    beta: data.market.beta || 1,
    equityRiskPremium: data.market.equityRiskPremium ?? 4.2,
    preTaxCostDebt: observedCostDebt && Number.isFinite(observedCostDebt) ? clamp(observedCostDebt, 3, 20) : 6,
    companyRiskPremium: rec.companyRiskPremium,
    terminalGrowth: rec.terminal,
    terminalRoic: 10,
    exitMultiple: rec.multiple,
    cash: data.metrics.cash,
    shortDebt: data.metrics.shortDebt || 0,
    longDebt: data.metrics.longDebt ?? data.metrics.debt,
    preferredInterest: data.metrics.preferredInterest || 0,
    shares: Math.round((data.market.shares || 1) * 1000) / 1000,
    marketPrice: Math.round(data.market.estimatedPrice * 100) / 100,
    valuationDate: localValuationDate(),
  };
  baseModel.companyRiskPremium = betaCoveragePremium(data.market.betaSource, rec.wacc, calculateWacc(baseModel).baseWacc);
  baseModel.terminalRoic = calculateWacc(baseModel).selectedWacc;
  return baseModel;
}

const calculate = (data: CompanyData, model: Model, method: Method, overrides: { wacc?: number; terminalGrowth?: number; exitMultiple?: number } = {}) =>
  calculateDcf(data, model, method, overrides);

function moveFromPrice(value: number, price: number) {
  const change = price ? (value / price - 1) * 100 : 0;
  return { change, label: change >= 0 ? "Upside" : "Downside" };
}

function geopoliticalExposure(data: CompanyData) {
  const country = data.company.country || "Domicile unavailable";
  const domicileKnown = !/unavailable|unknown|unclassified/i.test(country);
  const businessNiche = data.comparison?.nicheLabel || data.company.industry || data.company.sector;
  const context = `${businessNiche} ${data.company.industry} ${data.company.sector} ${data.company.description}`;
  const filingSignal = data.businessAnalysis?.supplyChain.signals.find((signal) =>
    /geographic|china|taiwan|export|sanction|trade/i.test(`${signal.title} ${signal.detail}`),
  );
  const countryRisk = /china|russia|taiwan|ukraine|israel/i.test(country);
  let sensitiveIndustry = false;
  let channel = domicileKnown
    ? `The automated data does not identify an obvious geopolitically sensitive business model. The main unanswered questions are how much revenue, sourcing, and operating capacity sit outside ${country}.`
    : "The company domicile could not be verified from the available metadata, so the model cannot reliably classify country-specific sanctions, trade, tax, or operating exposure.";

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
  } else if (/electric[- ]vehicle|automotive|automobile|vehicle manufactur|auto manufactur/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are tariffs and local-content rules on vehicles and batteries, export controls affecting advanced chips, and dependence on cross-border battery-material and semiconductor supply chains. These can restrict market access, raise component costs, or require additional local manufacturing investment.";
  }

  if (/china/i.test(country)) {
    channel = `As a China-domiciled issuer, the company may also be affected by U.S.–China trade restrictions, Chinese industrial and data regulation, U.S. listing and audit requirements, and RMB/USD movements. ${channel}`;
  } else if (/russia|ukraine|israel|taiwan/i.test(country)) {
    channel = `The stated domicile itself creates elevated conflict, sanctions, trade-route, or market-access exposure. ${channel}`;
  }

  if (filingSignal) {
    channel = `${filingSignal.detail} ${channel}`;
  }

  const level: "high" | "medium" | "low" = countryRisk ? "high" : !domicileKnown || filingSignal || sensitiveIndustry ? "medium" : "low";
  const evidenceLimit = data.businessAnalysis?.supplyChain.filingReviewed
    ? "This screen reviewed the latest annual filing, but it does not calculate revenue or supplier percentages by country."
    : "A parseable annual filing was not available, so this screen uses only the reported domicile and business type—not revenue or supplier percentages by country.";
  return {
    level,
    title: "Geopolitical and cross-border exposure",
    detail: `For ${data.company.symbol}, the available company metadata lists the domicile as ${country} and identifies the business as ${businessNiche}. ${channel} This matters to the DCF because it can lower revenue growth or increase capex and operating costs. ${evidenceLimit}`,
  };
}

function riskAnalysis(data: CompanyData, model: Model, perpetuity: ReturnType<typeof calculate>, multiple: ReturnType<typeof calculate>) {
  const risks: Array<{ level: "high" | "medium" | "low"; title: string; detail: string }> = [];
  const capex = data.metrics.capexPercentRevenue;
  risks.push({ level: capex > 12 ? "high" : capex > 6 ? "medium" : "low", title: "Capital intensity", detail: `${fmt.format(capex)}% of latest revenue was spent on capex. High reinvestment can prevent accounting profit from becoming distributable cash.` });
  const leverage = data.metrics.debt / Math.max(data.metrics.revenue, 1);
  risks.push({ level: leverage > 1 ? "high" : leverage > .45 ? "medium" : "low", title: "Balance-sheet leverage", detail: `Debt equals ${fmt.format(leverage * 100)}% of annual revenue. Refinancing risk rises if rates increase or earnings deteriorate.` });
  const terminalShares = [perpetuity.valid ? perpetuity.terminalShare : null, multiple.valid ? multiple.terminalShare : null].filter((value): value is number => value !== null);
  const terminalShare = terminalShares.length ? Math.max(...terminalShares) : 100;
  const terminalDetail = `${perpetuity.valid ? `${fmt.format(perpetuity.terminalShare)}% of perpetual-growth enterprise value` : "The perpetual-growth method is currently invalid"}; ${multiple.valid ? `${fmt.format(multiple.terminalShare)}% of exit-multiple enterprise value` : "the exit-multiple method is currently invalid"}. Terminal value represents cash flows beyond Year 5.`;
  risks.push({ level: terminalShare > 80 ? "high" : terminalShare > 65 ? "medium" : "low", title: "Terminal-value dependence", detail: terminalDetail });
  if (perpetuity.valid && Math.abs(perpetuity.terminalForecastFcf) > 1) {
    const normalizationChange = (perpetuity.terminalFcf / perpetuity.terminalForecastFcf - 1) * 100;
    if (Math.abs(normalizationChange) > 25) {
      risks.push({
        level: Math.abs(normalizationChange) > 75 ? "high" : "medium",
        title: "Terminal cash-flow normalization",
        detail: `The explicit Year-5 forecast produces ${usd0.format(perpetuity.terminalForecastFcf)}M of UFCF, while the perpetual formula uses ${usd0.format(perpetuity.terminalFcf)}M after linking mature growth to required reinvestment at terminal ROIC—a ${fmt.format(Math.abs(normalizationChange))}% ${normalizationChange >= 0 ? "increase" : "decrease"}. A large step means explicit capex, D&A, working capital, or margins have not fully converged to the terminal economics. Extend or revise the fade rather than accepting the jump without evidence.`,
      });
    }
  }
  risks.push(geopoliticalExposure(data));
  const marginRows = data.historical.filter((row) => Number.isFinite(row.ebitMargin));
  const lowMarginRow = marginRows.reduce<HistoricalRow | null>((lowest, row) => !lowest || row.ebitMargin < lowest.ebitMargin ? row : lowest, null);
  const highMarginRow = marginRows.reduce<HistoricalRow | null>((highest, row) => !highest || row.ebitMargin > highest.ebitMargin ? row : highest, null);
  const spread = lowMarginRow && highMarginRow ? highMarginRow.ebitMargin - lowMarginRow.ebitMargin : 0;
  const modeledMargin = model.forecastDrivers[5]?.ebitMargin ?? data.metrics.ebitMargin;
  const marginDetail = lowMarginRow && highMarginRow
    ? `EBIT margin ranged from ${fmt.format(lowMarginRow.ebitMargin)}% in ${lowMarginRow.year} to ${fmt.format(highMarginRow.ebitMargin)}% in ${highMarginRow.year}, a ${fmt.format(spread)} percentage-point swing. The final explicit forecast assumes ${fmt.format(modeledMargin)}%. A wide historical range means operating profit—and therefore free cash flow—may be harder to forecast reliably.`
    : `There was not enough historical EBIT-margin data to judge stability. The final explicit forecast assumes ${fmt.format(modeledMargin)}%, so verify that assumption against company guidance and a full business cycle.`;
  risks.push({ level: spread > 15 ? "high" : spread > 7 ? "medium" : "low", title: "Operating-margin consistency", detail: marginDetail });
  const marginExpansion = modeledMargin - data.metrics.ebitMargin;
  if (data.metrics.ebitMargin < 0 || marginExpansion > 10) {
    risks.push({
      level: "high",
      title: "Turnaround assumption",
      detail: `The automatic scenario moves EBIT margin from ${fmt.format(data.metrics.ebitMargin)}% in the latest reported period to ${fmt.format(modeledMargin)}% in the final explicit year, a ${fmt.format(marginExpansion)} percentage-point change. This is a website-generated scenario—not analyst consensus. Validate the timing, capacity utilization, pricing, cost structure, and funding needed to achieve it before relying on either valuation method.`,
    });
  }
  if (perpetuity.valid && multiple.valid) {
    const methodSpread = Math.abs(perpetuity.perShare - multiple.perShare) / Math.max(Math.min(perpetuity.perShare, multiple.perShare), .01) * 100;
    if (methodSpread > 25) {
      risks.push({
        level: methodSpread > 75 ? "high" : "medium",
        title: "Terminal-method disagreement",
        detail: `The perpetual-growth scenario gives ${usd.format(perpetuity.perShare)} per share while the exit-multiple scenario gives ${usd.format(multiple.perShare)}, a ${fmt.format(methodSpread)}% spread relative to the lower result. This usually means the selected terminal multiple implies different mature growth, margins, reinvestment, or returns than the perpetual model. Do not average the two mechanically; reconcile the terminal assumptions first.`,
      });
    }
  }
  const validValues = [...(multiple.valid ? [multiple.perShare] : []), ...(perpetuity.valid ? [perpetuity.perShare] : [])];
  if (!validValues.length) {
    risks.push({ level: "high", title: "Room for forecast error", detail: "Neither terminal method currently has valid assumptions, so the model cannot calculate a valuation cushion. Correct the invalid WACC, growth, ROIC, EBITDA, multiple, or share-count input first." });
    return risks;
  }
  const lowValue = Math.min(...validValues);
  const highValue = Math.max(...validValues);
  const conservativeMove = moveFromPrice(lowValue, model.marketPrice);
  const valuationDetail = model.marketPrice <= 0
    ? `The two DCF methods imply ${usd.format(lowValue)}–${usd.format(highValue)} per share, but a valid market price was unavailable, so the model cannot measure room for forecast error.`
    : conservativeMove.change >= 0
      ? `The lower of the two DCF estimates is ${usd.format(lowValue)}, which is ${fmt.format(conservativeMove.change)}% above the ${usd.format(model.marketPrice)} market-price input. That difference is the room for forecast error: the conservative estimate exceeds the price by ${usd.format(lowValue - model.marketPrice)} per share. The other method gives ${usd.format(highValue)}.`
      : `The lower of the two DCF estimates is ${usd.format(lowValue)}, which is ${fmt.format(Math.abs(conservativeMove.change))}% below the ${usd.format(model.marketPrice)} market-price input. On the more conservative method, the stock price already exceeds estimated value, so there is no margin of safety. The other method gives ${usd.format(highValue)}.`;
  const evidenceLevel: "high" | "medium" | "low" = !data.forecast ? "high" : data.businessAnalysis?.filing ? "low" : "medium";
  const priceLevel: "high" | "medium" | "low" = conservativeMove.change < 10 ? "high" : conservativeMove.change < 25 ? "medium" : "low";
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const level = rank[evidenceLevel] > rank[priceLevel] ? evidenceLevel : priceLevel;
  const evidenceDetail = !data.forecast
    ? " No validated revenue forecast was available, so a large numerical upside does not create a dependable margin of safety."
    : data.businessAnalysis?.filing
      ? " Filing data was available for historical cross-checks, but the forecast still requires analyst judgment."
      : " SEC filing data was unavailable for this load, so the apparent cushion receives at least a medium-risk label.";
  risks.push({ level, title: "Room for forecast error", detail: `${valuationDetail}${evidenceDetail}` });
  return risks;
}

function financialSectorRiskAnalysis(data: CompanyData) {
  const filingAvailable = Boolean(data.businessAnalysis?.filing);
  const evidence = filingAvailable
    ? "The latest filing was available, but this screen does not extract regulatory schedules or loan/insurance reserve tables."
    : "The SEC filing feed was unavailable, so no institution-specific regulatory ratios were verified.";
  return [
    {
      level: "high" as const,
      title: "Valuation-method limitation",
      detail: "A standard enterprise-value UFCF DCF is intentionally disabled because debt and interest are operating inputs for banks and insurers. Use residual income, dividend discount, excess return, or price-to-tangible-book analysis tied to regulatory capital instead.",
    },
    {
      level: "medium" as const,
      title: "Capital adequacy",
      detail: `Review CET1 and total capital ratios, risk-weighted-asset growth, stress-test buffers, and the capacity to return capital. A thin buffer can constrain dividends and balance-sheet growth. ${evidence}`,
    },
    {
      level: "medium" as const,
      title: "Credit quality and reserves",
      detail: `Review nonperforming assets, net charge-offs, criticized loans, reserve coverage, underwriting vintages, and sector concentrations. Losses above reserved levels reduce book value and distributable earnings. ${evidence}`,
    },
    {
      level: "medium" as const,
      title: "Funding, liquidity, and rate sensitivity",
      detail: `Review uninsured deposits, deposit beta, wholesale funding, available liquidity, securities duration, accumulated other comprehensive income, and net-interest-income sensitivity. Deposit flight or adverse rate moves can compress earnings or force asset sales. ${evidence}`,
    },
    {
      level: "medium" as const,
      title: "Regulatory and conduct exposure",
      detail: "Capital rules, consumer-protection actions, anti-money-laundering controls, litigation, and resolution requirements can change allowable growth, expenses, and capital distributions.",
    },
    geopoliticalExposure(data),
  ];
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
  terminalRoic: "Terminal return on invested capital: the return assumed on new long-run investment. Perpetual reinvestment equals growth divided by terminal ROIC. Setting terminal ROIC equal to WACC assumes new investment creates no excess value in perpetuity.",
  yearFive: "Year 5 is the point exactly five years after the valuation date. When that date falls between two fiscal year-ends, the model blends the fifth and sixth forecast periods. That blended UFCF or EBITDA is used to calculate terminal value.",
  perpetualGrowth: "Perpetual growth method: assumes cash flow grows at a stable rate forever after Year 5. The growth rate must stay below WACC.",
  exitMultiple: "Exit multiple method: estimates the company’s Year 5 value by multiplying Year 5 EBITDA by a market valuation multiple.",
  enterpriseValue: "Enterprise value: the value of the operating business available to both lenders and shareholders, before adding cash and subtracting debt.",
  equityValue: "Equity value: the portion belonging to common shareholders after adding available cash and subtracting debt and other senior claims.",
  dilutedShares: "Diluted shares: the share count including potential dilution from options, restricted stock, convertibles, and similar securities.",
  discountFactor: "Discount factor: the multiplier that converts a future cash flow into today’s dollars using WACC and the number of years away.",
  revenueGrowth: "Starting revenue growth: the expected percentage increase in sales during Year 1. The model gradually fades this rate toward the long-run terminal growth rate.",
  ebitMargin: "Target EBIT margin: the percentage of revenue expected to remain as operating profit before interest and taxes by Year 5.",
  taxRate: "Tax rate: the normalized cash tax percentage applied to positive operating profit. It should reflect a sustainable rate rather than a one-time tax benefit or charge.",
  terminalGrowth: "Terminal growth: the annual rate the company is assumed to grow forever after Year 5. It must remain below WACC, should generally not exceed the same-currency risk-free rate, and should resemble mature long-run nominal growth.",
  marketPrice: "Market price: the current or reference share price used only to calculate potential upside or downside. Changing it does not change the DCF’s intrinsic value.",
  cash: "Cash: cash considered available to shareholders. It is added to enterprise value when calculating equity value.",
  fundedDebt: "Funded debt: interest-bearing borrowings that must be repaid. It is subtracted from enterprise value before calculating equity value.",
  riskFreeRate: "Risk-free rate: the return investors could earn with minimal default risk, commonly approximated with a long-term U.S. Treasury yield. It forms the starting point for required returns.",
  beta: "Beta: an estimate of how sensitive the stock has been to broad market movements. When sufficient history exists, this site adjusts the raw regression beta one-third toward 1.0 to reduce sampling noise. A beta of 1.0 moves roughly with the market.",
  equityRiskPremium: "Equity risk premium: the additional annual return investors require for owning stocks instead of a risk-free asset.",
  costOfEquity: "Cost of equity: the return shareholders require for taking the company’s risk. This reference uses risk-free rate + beta × equity risk premium.",
  equityWeight: "Equity / capital: the percentage of the company’s financing represented by equity market value. It determines how much the cost of equity influences WACC.",
  preTaxCostOfDebt: "Pre-tax cost of debt: the estimated interest rate the company pays or would pay on borrowings before the tax benefit of deductible interest.",
  debtWeight: "Debt / capital: the percentage of financing represented by funded debt. It determines how much the after-tax cost of debt influences WACC.",
  companySpecificPremium: "Company-specific premium: a visible judgment adjustment added after the standard WACC formula. It starts at 0% when beta history is sufficient. If beta history is insufficient, the automatic starting value only fills the gap to the disclosed industry WACC; replace it with a bottom-up beta when possible and avoid double counting risk in cash flows.",
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
  const closePeers = (data.comparison?.peers || []).filter((peer) => peer.peerFit !== "adjacent");
  const peerMultiples = closePeers.map((peer) => peer.evToEbitda).filter((value): value is number => value !== null && Number.isFinite(value));
  const medianMultiple = peerMultiples.length >= 2 ? validMedian(peerMultiples) : null;
  const impliedExitMultiple = result.terminalEbitda > 0 ? result.terminalValue / result.terminalEbitda : null;
  const terminalFcfYield = result.terminalValue > 0 ? result.terminalFcf / result.terminalValue : null;
  const impliedGrowth = terminalFcfYield === null ? null : (result.waccPercent / 100 - terminalFcfYield) / (1 + terminalFcfYield) * 100;
  const validMoney = (value: number) => result.valid ? `${usd0.format(value)}M` : "—";
  return <div className="bridge-table">
    <div className="sheet-bar">{title}</div>
    {!result.valid && <div className="invalid-method"><b>No valid {method === "perpetuity" ? "perpetual-growth" : "exit-multiple"} value</b><p>{result.invalidReason} Correct the highlighted valuation assumptions before relying on this method.</p></div>}
    {method === "perpetuity" ? <>
      <div className="method-explainer"><span>WHAT THIS METHOD DOES</span><p>The model normalizes Year-5 cash flow by linking perpetual growth to the reinvestment required at the selected terminal <DefinedTerm term="terminalRoic">ROIC</DefinedTerm>. It then applies the growing-perpetuity formula and discounts terminal value back exactly five years.</p><code>{fmt.format(result.terminalNopat)} × (1 − {fmt.format(model.terminalGrowth)}% ÷ {fmt.format(model.terminalRoic)}%) = {result.valid ? fmt.format(result.terminalFcf) : "invalid"} normalized FCF<br/>{fmt.format(result.terminalFcf)} × (1 + {fmt.format(model.terminalGrowth)}%) ÷ ({fmt.format(result.waccPercent)}% − {fmt.format(model.terminalGrowth)}%) = {result.valid ? fmt.format(result.terminalValue) : "invalid"}</code><small>Terminal FCF = NOPAT × (1 − g ÷ ROIC); Terminal value = FCF × (1 + g) ÷ (<DefinedTerm term="wacc">WACC</DefinedTerm> − g)</small></div>
      <div className="reference-row"><span>Observed niche-peer growth</span><b>{industryGrowth === null ? "—" : `${fmt.format(industryGrowth)}%`}</b></div>
      <div><span>Selected perpetual growth</span><b>{fmt.format(model.terminalGrowth)}%</b></div>
      <div><span>Selected terminal <DefinedTerm term="terminalRoic">ROIC</DefinedTerm></span><b>{fmt.format(model.terminalRoic)}%</b></div>
      <div><span>Required terminal reinvestment</span><b>{result.terminalReinvestmentRate === null ? "—" : `${fmt.format(result.terminalReinvestmentRate * 100)}% of NOPAT`}</b></div>
      <div><span>Year-5 forecast <DefinedTerm term="ufcf">FCF</DefinedTerm> before normalization</span><b>{usd0.format(result.terminalForecastFcf)}M</b></div>
      <div><span>Normalized terminal <DefinedTerm term="ufcf">FCF</DefinedTerm></span><b>{usd0.format(result.terminalFcf)}M</b></div>
      <div><span>Implied exit <DefinedTerm term="exitMultiple">multiple</DefinedTerm></span><b>{impliedExitMultiple === null ? "—" : `${fmt.format(impliedExitMultiple)}×`}</b></div>
      <p className="bridge-note">Peer growth is median recent year-over-year revenue growth for the selected niche. It is context—not a perpetual forecast. Terminal ROIC defaults to WACC, which assumes new investment earns no excess return in perpetuity; raise it only with evidence of durable long-run excess returns.</p>
      {model.terminalRoic < result.waccPercent && <p className="bridge-note terminal-warning">Terminal review: ROIC is below WACC, so perpetual reinvestment destroys value. That can be modeled deliberately, but it should not be an accidental assumption.</p>}
    </> : <>
      <div className="method-explainer"><span>WHAT THIS METHOD DOES</span><p>The model blends EBITDA at the exact five-year valuation date, applies the selected enterprise-value multiple, and discounts that terminal value back exactly five years.</p><code>{fmt.format(result.terminalEbitda)} × {fmt.format(model.exitMultiple)} = {result.valid ? fmt.format(result.terminalValue) : "invalid"}</code><small>Year-5 <DefinedTerm term="ebitda">EBITDA</DefinedTerm> × selected <DefinedTerm term="exitMultiple">exit multiple</DefinedTerm></small></div>
      <div><span>Year 5 <DefinedTerm term="ebitda">EBITDA</DefinedTerm></span><b>{usd0.format(result.terminalEbitda)}M</b></div>
      <div><span>Selected exit multiple</span><b>{fmt.format(model.exitMultiple)}×</b></div>
      <div className="reference-row"><span>Peer median EV / <DefinedTerm term="ebitda">EBITDA</DefinedTerm></span><b>{medianMultiple === null ? "—" : `${fmt.format(medianMultiple)}×`}</b></div>
      <div><span>Peer EV / <DefinedTerm term="ebitda">EBITDA</DefinedTerm> range</span><b>{peerMultiples.length ? `${fmt.format(Math.min(...peerMultiples))}–${fmt.format(Math.max(...peerMultiples))}×` : "—"}</b></div>
      <div><span>Implied perpetual growth</span><b>{impliedGrowth === null ? "—" : `${fmt.format(impliedGrowth)}%`}</b></div>
      <p className="bridge-note">The selected exit multiple stays editable. The peer reference is shown only when at least two direct or close peers have positive latest-fiscal EBITDA. These free-data ratios are not LTM or forward multiples, so verify them before relying on the comparison.</p>
    </>}
    <div><span><DefinedTerm term="pv">PV</DefinedTerm> of forecast <DefinedTerm term="ufcf">UFCF</DefinedTerm></span><b>{usd0.format(result.pvForecast)}M</b></div>
    <div><span><DefinedTerm term="pv">PV</DefinedTerm> of <DefinedTerm term="terminalValue">terminal value</DefinedTerm></span><b>{validMoney(result.pvTerminal)}</b></div>
    <div className="total"><span><DefinedTerm term="enterpriseValue">Enterprise value</DefinedTerm></span><b>{validMoney(result.enterpriseValue)}</b></div>
    <div><span>Plus: Cash</span><b>{usd0.format(model.cash)}M</b></div>
    <div><span>Less: Short-term debt</span><b>({usd0.format(model.shortDebt)}M)</b></div>
    <div><span>Less: Long-term debt</span><b>({usd0.format(model.longDebt)}M)</b></div>
    <div><span>Less: Other non-equity claims</span><b>({usd0.format(model.preferredInterest)}M)</b></div>
    <div className="total"><span><DefinedTerm term="equityValue">Equity value</DefinedTerm></span><b>{validMoney(result.equityValue)}</b></div>
    <div><span><DefinedTerm term="dilutedShares">Share count used</DefinedTerm></span><b>{fmt.format(model.shares)}M</b></div>
    <div className="answer"><span>Implied price per share</span><b>{result.valid ? usd.format(result.perShare) : "—"}</b></div>
  </div>;
}

function SensitivityTable({ data, model, method }: { data: CompanyData; model: Model; method: Method }) {
  const selectedWacc = calculateWacc(model).selectedWacc;
  const waccs = [-1, -.5, 0, .5, 1].map((shift) => Math.max(1, selectedWacc + shift));
  const columns = method === "perpetuity"
    ? [-1, -.5, 0, .5, 1].map((shift) => Math.max(0, model.terminalGrowth + shift))
    : [-4, -2, 0, 2, 4].map((shift) => Math.max(1, model.exitMultiple + shift));
  return <div className="sensitivity-wrap">
    <div className="sheet-bar">Implied price per share — {method === "perpetuity" ? "Perpetual growth" : "Exit multiple"}</div>
    <div className="table-scroll"><table className="sensitivity-table"><thead><tr><th><DefinedTerm term="wacc">WACC</DefinedTerm> ↓</th>{columns.map((value) => <th key={value}>{fmt.format(value)}{method === "perpetuity" ? "%" : "×"}</th>)}</tr></thead><tbody>
      {waccs.map((wacc) => <tr key={wacc}><th>{fmt.format(wacc)}%</th>{columns.map((column) => {
        const result = calculate(data, model, method, method === "perpetuity" ? { wacc, terminalGrowth: column } : { wacc, exitMultiple: column });
        const active = Math.abs(wacc - selectedWacc) < .01 && Math.abs(column - (method === "perpetuity" ? model.terminalGrowth : model.exitMultiple)) < .01;
        return <td className={active ? "active" : ""} key={column}>{result.valid ? usd.format(result.perShare) : "—"}</td>;
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
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
  const hoveredPoint = hoveredIndex === null ? null : filtered[Math.min(hoveredIndex, filtered.length - 1)];
  const hoveredX = hoveredPoint && hoveredIndex !== null ? x(Math.min(hoveredIndex, filtered.length - 1)) : null;
  const hoveredY = hoveredPoint ? y(hoveredPoint.close) : null;
  const tooltipWidth = 150;
  const tooltipHeight = 52;
  const tooltipX = hoveredX === null ? 0 : clamp(hoveredX - tooltipWidth / 2, pad.left, width - pad.right - tooltipWidth);
  const tooltipY = hoveredY === null ? 0 : hoveredY - tooltipHeight - 14 < pad.top ? hoveredY + 14 : hoveredY - tooltipHeight - 14;
  const fullDateLabel = (date: string) => new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const selectNearestPoint = (clientX: number, currentTarget: SVGRectElement) => {
    const bounds = currentTarget.getBoundingClientRect();
    const chartX = (clientX - bounds.left) / Math.max(bounds.width, 1) * width;
    const ratio = clamp((chartX - pad.left) / (width - pad.left - pad.right), 0, 1);
    setHoveredIndex(Math.round(ratio * (filtered.length - 1)));
  };
  return <div className="price-chart-card">
    <div className="chart-head"><div><span>{symbol} {selectedInterval.heading} CLOSE</span><h3>{usd.format(last.close)} <i className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{fmt.format(change)}%</i></h3></div><div className="chart-controls"><div className="chart-control-row"><span>RANGE</span><div className="period-toggle" role="group" aria-label="Stock-price time range">{periods.map((item) => <button type="button" aria-pressed={item === period} className={item === period ? "active" : ""} key={item} onClick={() => setPeriod(item)}>{item}</button>)}</div></div><div className="chart-control-row"><span>INTERVAL</span><div className="period-toggle interval-toggle" role="group" aria-label="Stock-price observation interval">{intervals.map((item) => <button type="button" aria-pressed={item.value === interval} className={item.value === interval ? "active" : ""} key={item.value} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div></div></div></div>
    <svg className="price-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${symbol} ${selectedInterval.label.toLowerCase()} closing price chart for ${period}`}>
      <defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#78924b" stopOpacity=".28"/><stop offset="1" stopColor="#78924b" stopOpacity="0"/></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((ratio) => { const value = max - (max - min) * ratio; const yPos = y(value); return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={yPos} y2={yPos}/><text x={pad.left - 10} y={yPos + 4} textAnchor="end">{usd0.format(value)}</text></g>; })}
      {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 17} textAnchor={index === 0 ? "start" : index === filtered.length - 1 ? "end" : "middle"}>{dateLabel(filtered[index].date)}</text>)}
      <path className="price-area" d={area}/><path className="price-line" d={line}/>
      <circle cx={x(filtered.length - 1)} cy={y(last.close)} r="4"/>
      <rect
        className="price-hover-target"
        x={pad.left}
        y={pad.top}
        width={width - pad.left - pad.right}
        height={height - pad.top - pad.bottom}
        tabIndex={0}
        aria-label="Hover or use the left and right arrow keys to inspect closing prices"
        onPointerMove={(event) => selectNearestPoint(event.clientX, event.currentTarget)}
        onPointerDown={(event) => selectNearestPoint(event.clientX, event.currentTarget)}
        onPointerLeave={() => setHoveredIndex(null)}
        onFocus={() => setHoveredIndex(filtered.length - 1)}
        onBlur={() => setHoveredIndex(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          setHoveredIndex((current) => clamp((current ?? filtered.length - 1) + direction, 0, filtered.length - 1));
        }}
      />
      {hoveredPoint && hoveredX !== null && hoveredY !== null && <g className="price-tooltip" pointerEvents="none">
        <line className="price-crosshair" x1={hoveredX} x2={hoveredX} y1={pad.top} y2={height - pad.bottom}/>
        <circle className="price-hover-dot" cx={hoveredX} cy={hoveredY} r="5"/>
        <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="4"/>
        <text className="price-tooltip-date" x={tooltipX + 12} y={tooltipY + 19}>{fullDateLabel(hoveredPoint.date)}</text>
        <text className="price-tooltip-price" x={tooltipX + 12} y={tooltipY + 39}>{usd.format(hoveredPoint.close)} close</text>
      </g>}
    </svg>
    <div className="chart-stats"><span>Period low <b>{usd.format(rawMin)}</b></span><span>Period high <b>{usd.format(rawMax)}</b></span><span>Observations <b>{filtered.length} {selectedInterval.label.toLowerCase()} closes</b></span><span>Price return only <b>dividends excluded · MAX up to 10Y</b></span></div>
  </div>;
}

function OutputScreen({
  data,
  model,
  perpetuity,
  multiple,
  risks,
  forecastConfidence,
  forecastConfidenceDetail,
  financialUnsupported,
}: {
  data: CompanyData;
  model: Model;
  perpetuity: ReturnType<typeof calculate>;
  multiple: ReturnType<typeof calculate>;
  risks: RiskItem[];
  forecastConfidence: string;
  forecastConfidenceDetail: string;
  financialUnsupported: boolean;
}) {
  const validValues = [perpetuity.valid ? perpetuity.perShare : null, multiple.valid ? multiple.perShare : null]
    .filter((value): value is number => value !== null);
  const lowValue = validValues.length ? Math.min(...validValues) : null;
  const highValue = validValues.length ? Math.max(...validValues) : null;
  const netDebt = model.shortDebt + model.longDebt - model.cash;
  const selectedWacc = calculateWacc(model).selectedWacc;
  const rangeMove = lowValue === null || model.marketPrice <= 0 ? null : (lowValue / model.marketPrice - 1) * 100;
  const terminalBlend = (selector: (year: (typeof perpetuity.years)[number]) => number) =>
    selector(perpetuity.years[4]) * perpetuity.firstYearWeight + selector(perpetuity.years[5]) * perpetuity.lastYearWeight;
  const terminalRevenue = terminalBlend((year) => year.revenue);
  const terminalEbit = terminalBlend((year) => year.ebit);
  const terminalTax = terminalBlend((year) => year.tax);
  const terminalDa = terminalBlend((year) => year.depreciation);
  const terminalCapex = terminalBlend((year) => year.capex);
  const terminalNwc = terminalBlend((year) => year.changeNwc);
  const outputMoney = (value: number | null) => value === null || !Number.isFinite(value)
    ? "—"
    : value < 0 ? `(${usd0.format(Math.abs(value))})` : usd0.format(value);
  const outputPercent = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : `${fmt.format(value)}%`;
  const outputFactor = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : value.toFixed(2);
  const forecastRows = [
    { label: "Revenue", values: perpetuity.years.map((year) => year.revenue), terminal: terminalRevenue, format: outputMoney },
    { label: "EBITDA", values: perpetuity.years.map((year) => year.ebitda), terminal: perpetuity.terminalEbitda, format: outputMoney },
    { label: "EBITDA margin", values: perpetuity.years.map((year) => year.revenue ? year.ebitda / year.revenue * 100 : null), terminal: terminalRevenue ? perpetuity.terminalEbitda / terminalRevenue * 100 : null, format: outputPercent, type: "ratio" },
    { label: "EBIT", values: perpetuity.years.map((year) => year.ebit), terminal: terminalEbit, format: outputMoney },
    { label: "Less: cash tax on EBIT", values: perpetuity.years.map((year) => -year.tax), terminal: -terminalTax, format: outputMoney },
    { label: "Plus: D&A", values: perpetuity.years.map((year) => year.depreciation), terminal: terminalDa, format: outputMoney },
    { label: "Less: capex", values: perpetuity.years.map((year) => -year.capex), terminal: -terminalCapex, format: outputMoney },
    { label: "Less: change in NWC", values: perpetuity.years.map((year) => -year.changeNwc), terminal: -terminalNwc, format: outputMoney },
    { label: "Unlevered free cash flow", values: perpetuity.years.map((year) => year.fcf), terminal: perpetuity.terminalForecastFcf, format: outputMoney, type: "total" },
    { label: "Included portion of fiscal year", values: perpetuity.years.map((year) => year.weight * 100), terminal: 100, format: outputPercent, type: "ratio" },
    { label: "Mid-year discount period", values: perpetuity.years.map((year) => year.discountPeriod), terminal: 5, format: outputFactor, type: "ratio" },
    { label: "Discount factor", values: perpetuity.years.map((year) => year.discountFactor), terminal: 1 / Math.pow(1 + selectedWacc / 100, 5), format: (value: number | null) => value === null || !Number.isFinite(value) ? "—" : value.toFixed(3), type: "ratio" },
    { label: "Present value of UFCF", values: perpetuity.years.map((year) => year.pv), terminal: perpetuity.pvForecast, format: outputMoney, type: "answer" },
  ];
  const moveLabel = (value: number, valid: boolean) => !valid || model.marketPrice <= 0
    ? "—"
    : `${value >= model.marketPrice ? "Upside" : "Downside"} ${fmt.format(Math.abs((value / model.marketPrice - 1) * 100))}%`;
  const bridgeRows = [
    { label: "WACC", perpetuity: outputPercent(perpetuity.waccPercent), multiple: outputPercent(multiple.waccPercent) },
    { label: "Terminal assumption", perpetuity: `${fmt.format(model.terminalGrowth)}% growth`, multiple: `${fmt.format(model.exitMultiple)}× EBITDA` },
    { label: "Year-5 terminal basis", perpetuity: `${outputMoney(perpetuity.terminalFcf)} normalized UFCF`, multiple: `${outputMoney(multiple.terminalEbitda)} EBITDA` },
    { label: "Terminal value at Year 5", perpetuity: perpetuity.valid ? outputMoney(perpetuity.terminalValue) : "—", multiple: multiple.valid ? outputMoney(multiple.terminalValue) : "—" },
    { label: "PV of explicit forecast UFCF", perpetuity: perpetuity.valid ? outputMoney(perpetuity.pvForecast) : "—", multiple: multiple.valid ? outputMoney(multiple.pvForecast) : "—" },
    { label: "PV of terminal value", perpetuity: perpetuity.valid ? outputMoney(perpetuity.pvTerminal) : "—", multiple: multiple.valid ? outputMoney(multiple.pvTerminal) : "—" },
    { label: "Enterprise value", perpetuity: perpetuity.valid ? outputMoney(perpetuity.enterpriseValue) : "—", multiple: multiple.valid ? outputMoney(multiple.enterpriseValue) : "—", type: "total" },
    { label: "Plus: cash & included investments", perpetuity: outputMoney(model.cash), multiple: outputMoney(model.cash) },
    { label: "Less: short- and long-term debt", perpetuity: outputMoney(-(model.shortDebt + model.longDebt)), multiple: outputMoney(-(model.shortDebt + model.longDebt)) },
    { label: "Less: other non-equity claims", perpetuity: outputMoney(-model.preferredInterest), multiple: outputMoney(-model.preferredInterest) },
    { label: "Common-equity value", perpetuity: perpetuity.valid ? outputMoney(perpetuity.equityValue) : "—", multiple: multiple.valid ? outputMoney(multiple.equityValue) : "—", type: "total" },
    { label: "Diluted shares", perpetuity: `${fmt.format(model.shares)}M`, multiple: `${fmt.format(model.shares)}M` },
    { label: "Implied value per share", perpetuity: perpetuity.valid ? usd.format(perpetuity.perShare) : "—", multiple: multiple.valid ? usd.format(multiple.perShare) : "—", type: "answer" },
    { label: "Current price input", perpetuity: usd.format(model.marketPrice), multiple: usd.format(model.marketPrice) },
    { label: "Upside / (downside)", perpetuity: moveLabel(perpetuity.perShare, perpetuity.valid), multiple: moveLabel(multiple.perShare, multiple.valid), type: "answer" },
    { label: "Terminal value / enterprise value", perpetuity: perpetuity.valid ? outputPercent(perpetuity.terminalShare) : "—", multiple: multiple.valid ? outputPercent(multiple.terminalShare) : "—" },
  ];
  const sensitivityWaccs = [selectedWacc - .5, selectedWacc, selectedWacc + .5];
  const sensitivityGrowth = [-1, -.5, 0, .5, 1].map((change) => model.terminalGrowth + change);
  const sensitivityMultiples = [-4, -2, 0, 2, 4].map((change) => Math.max(.5, model.exitMultiple + change));
  const sensitivityValue = (method: Method, wacc: number, terminal: number) => {
    const scenario = method === "perpetuity"
      ? calculate(data, model, method, { wacc, terminalGrowth: terminal })
      : calculate(data, model, method, { wacc, exitMultiple: terminal });
    return scenario.valid ? usd.format(scenario.perShare) : "—";
  };
  return <div className="output-screen">
    <div className="output-hero">
      <div><span>INVESTMENT OUTPUT · {data.company.symbol}</span><h3>{data.company.name}</h3><p>{briefDescription(data.company.description)}</p></div>
      <div className="output-price"><span>CURRENT PRICE INPUT</span><strong>{usd.format(model.marketPrice)}</strong><small>{data.market.priceDate ? `Nasdaq close · ${data.market.priceDate}` : data.market.priceBasis || "Editable market-price input"}</small></div>
    </div>
    {financialUnsupported ? <div className="output-sector-limit"><b>STANDARD DCF NOT APPROPRIATE</b><p>Use a bank- or insurer-specific framework built around regulatory capital, asset quality, funding economics, tangible book value, and return on equity. The comps and pitch-deck views remain available as research summaries.</p></div> : <>
      <div className="output-valuation-grid">
        <article><span>PERPETUAL-GROWTH VALUE</span><strong>{perpetuity.valid ? usd.format(perpetuity.perShare) : "—"}</strong><small>{perpetuity.valid ? `${fmt.format((perpetuity.perShare / Math.max(model.marketPrice, .01) - 1) * 100)}% versus price` : perpetuity.invalidReason}</small></article>
        <article><span>EXIT-MULTIPLE VALUE</span><strong>{multiple.valid ? usd.format(multiple.perShare) : "—"}</strong><small>{multiple.valid ? `${fmt.format((multiple.perShare / Math.max(model.marketPrice, .01) - 1) * 100)}% versus price` : multiple.invalidReason}</small></article>
        <article className="output-range"><span>AUTOMATED SCENARIO RANGE</span><strong>{lowValue === null || highValue === null ? "—" : lowValue === highValue ? usd.format(lowValue) : `${usd.format(lowValue)}–${usd.format(highValue)}`}</strong><small>{rangeMove === null ? "No valid market comparison" : `${rangeMove >= 0 ? "Lower scenario upside" : "Lower scenario downside"}: ${fmt.format(Math.abs(rangeMove))}%`}</small></article>
      </div>
      <div className="reference-sensitivity" aria-label="Implied price per share sensitivity tables">
        <div className="reference-sensitivity-card">
          <span className="reference-sensitivity-eyebrow">PERPETUAL-GROWTH SENSITIVITY</span>
          <h4>Implied value per share</h4>
          <p>Terminal growth rate</p>
          <div className="reference-sensitivity-scroll"><table><thead><tr><th>WACC</th>{sensitivityGrowth.map((growth) => <th key={growth}>{fmt.format(growth)}%</th>)}</tr></thead><tbody>{sensitivityWaccs.map((wacc, rowIndex) => <tr key={wacc}><th>{fmt.format(wacc)}%</th>{sensitivityGrowth.map((growth, columnIndex) => <td className={rowIndex === 1 && columnIndex === 2 ? "base-case" : ""} key={growth}>{sensitivityValue("perpetuity", wacc, growth)}</td>)}</tr>)}</tbody></table></div>
          <div className="reference-sensitivity-note"><b>What each cell does</b><span>Recalculates the entire DCF using the row’s WACC and column’s perpetual-growth rate: forecast UFCF + terminal value, discounted to enterprise value, bridged to common equity, then divided by diluted shares.</span></div>
        </div>
        <div className="reference-sensitivity-card">
          <span className="reference-sensitivity-eyebrow">EXIT-MULTIPLE SENSITIVITY</span>
          <h4>Implied value per share</h4>
          <p>Terminal EBITDA multiple</p>
          <div className="reference-sensitivity-scroll"><table><thead><tr><th>WACC</th>{sensitivityMultiples.map((exitMultiple) => <th key={exitMultiple}>{fmt.format(exitMultiple)}×</th>)}</tr></thead><tbody>{sensitivityWaccs.map((wacc, rowIndex) => <tr key={wacc}><th>{fmt.format(wacc)}%</th>{sensitivityMultiples.map((exitMultiple, columnIndex) => <td className={rowIndex === 1 && columnIndex === 2 ? "base-case" : ""} key={exitMultiple}>{sensitivityValue("multiple", wacc, exitMultiple)}</td>)}</tr>)}</tbody></table></div>
          <div className="reference-sensitivity-note"><b>What each cell does</b><span>Recalculates the entire DCF using the row’s WACC and column’s Year-5 EBITDA multiple: forecast UFCF + Year-5 EBITDA × multiple, discounted and bridged to common equity, then divided by diluted shares.</span></div>
        </div>
      </div>
      <div className="output-driver-grid">
        <div><span>SELECTED WACC</span><b>{pct2.format(selectedWacc)}%</b><small>Discount rate</small></div>
        <div><span>TERMINAL GROWTH</span><b>{fmt.format(model.terminalGrowth)}%</b><small>Perpetual method</small></div>
        <div><span>EXIT MULTIPLE</span><b>{fmt.format(model.exitMultiple)}×</b><small>Year-5 EBITDA</small></div>
        <div><span>NET DEBT</span><b>{usd0.format(netDebt)}M</b><small>Debt less cash</small></div>
        <div><span>YEAR-5 UFCF</span><b>{usd0.format(perpetuity.terminalForecastFcf)}M</b><small>Before normalization</small></div>
      </div>
      <div className="output-sheet" aria-label={`${data.company.symbol} DCF output tables`}>
        <div className="output-sheet-title"><div><span>DCF OUTPUT</span><h4>Forecast cash flow and valuation bridge</h4></div><small>USD IN MILLIONS EXCEPT PER-SHARE DATA</small></div>
        <div className="output-table-wrap">
          <table className="output-forecast-table">
            <thead><tr><th>Line item</th>{perpetuity.years.map((year) => <th key={year.periodEnd}>{fiscalPeriodLabel(year.periodEnd)}</th>)}<th>Year 5 / total</th></tr></thead>
            <tbody>{forecastRows.map((row) => <tr className={row.type ? `output-${row.type}` : ""} key={row.label}><td><DcfRowLabel label={row.label}/></td>{row.values.map((value, index) => <td key={`${row.label}-${perpetuity.years[index].periodEnd}`}>{row.format(value)}</td>)}<td>{row.format(row.terminal)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="output-table-note"><b>How to read the last column:</b> operating lines are interpolated exactly at Year 5; “Present value of UFCF” shows the total present value of the explicit forecast. Partial first and sixth fiscal years are weighted so the model values exactly five years.</p>
        <div className="output-table-wrap output-bridge-wrap">
          <table className="output-bridge-table">
            <thead><tr><th>Valuation output</th><th>Perpetual growth method</th><th>Exit multiple method</th></tr></thead>
            <tbody>{bridgeRows.map((row) => <tr className={row.type ? `output-${row.type}` : ""} key={row.label}><td>{row.label}</td><td>{row.perpetuity}</td><td>{row.multiple}</td></tr>)}</tbody>
          </table>
        </div>
        {(!perpetuity.valid || !multiple.valid) && <div className="output-invalid-note"><b>INVALID METHOD</b><p>{!perpetuity.valid ? `Perpetual growth: ${perpetuity.invalidReason} ` : ""}{!multiple.valid ? `Exit multiple: ${multiple.invalidReason}` : ""}</p></div>}
      </div>
    </>}
    <div className="output-review">
      <div><span>FORECAST CONFIDENCE · {forecastConfidence.toUpperCase()}</span><p>{forecastConfidenceDetail} These values are automated scenarios, not analyst price targets.</p></div>
      <div><span>TOP ITEMS TO VERIFY</span><ol>{risks.slice(0, 3).map((risk) => <li key={risk.title}><b>{risk.title}</b><small>{risk.detail}</small></li>)}</ol></div>
    </div>
    {!financialUnsupported && <a className="output-deep-link" href="#build">Continue to the detailed DCF workbook ↓</a>}
  </div>;
}

function PitchDeck({
  data,
  model,
  perpetuity,
  multiple,
  risks,
  financialUnsupported,
}: {
  data: CompanyData;
  model: Model;
  perpetuity: ReturnType<typeof calculate>;
  multiple: ReturnType<typeof calculate>;
  risks: RiskItem[];
  financialUnsupported: boolean;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const comparison = data.comparison;
  const company = comparison?.company || {
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
  const assessment = businessAssessment(data, company);
  const medianGrowth = peerMedian(data, "revenueGrowth");
  const medianMargin = peerMedian(data, "operatingMargin");
  const medianMultiple = peerMedian(data, financialUnsupported ? "pe" : "evToEbitda");
  const recentHistory = data.historical.slice(-3);
  const maxRevenue = Math.max(...recentHistory.map((row) => row.revenue), 1);
  const validValues = [perpetuity.valid ? perpetuity.perShare : null, multiple.valid ? multiple.perShare : null]
    .filter((value): value is number => value !== null);
  const lowValue = validValues.length ? Math.min(...validValues) : null;
  const highValue = validValues.length ? Math.max(...validValues) : null;
  const printDeck = () => {
    document.body.classList.add("printing-pitch");
    const cleanup = () => document.body.classList.remove("printing-pitch");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1_500);
  };
  const slides = [
    <article className="pitch-slide pitch-cover" key="cover">
      <div><span>AUTOMATED EQUITY-RESEARCH BRIEF</span><h3>{data.company.name}</h3><p>{data.company.symbol} · {data.company.exchange} · {data.company.country}</p></div>
      <div className="pitch-cover-number"><strong>{usd.format(model.marketPrice)}</strong><small>Market-price input</small></div>
      <footer><span>Valuation date · {model.valuationDate}</span><span>Educational scenario analysis</span></footer>
    </article>,
    <article className="pitch-slide" key="business">
      <header><span>01 · BUSINESS</span><h3>{comparison?.nicheLabel || businessFocus(company)}</h3></header>
      <div className="pitch-two-column"><div><h4>What the company does</h4><p>{briefDescription(data.company.description)}</p></div><div><h4>Competitive position</h4><strong>{assessment.verdict}</strong><p>{assessment.mechanism}</p></div></div>
      <footer><span>Verify: {assessment.verify}</span><span>{data.company.industry}</span></footer>
    </article>,
    <article className="pitch-slide" key="operations">
      <header><span>02 · OPERATING PROFILE</span><h3>Growth is only valuable if it converts into durable cash flow</h3></header>
      <div className="pitch-operating-grid"><div className="pitch-revenue-bars"><h4>Reported revenue</h4>{recentHistory.map((row) => <div key={row.year}><span>{row.year}</span><i><b style={{ width: `${row.revenue / maxRevenue * 100}%` }}/></i><strong>{usd0.format(row.revenue)}M</strong></div>)}</div><div className="pitch-metric-stack"><p><span>LATEST REVENUE GROWTH</span><strong>{fmt.format(data.metrics.revenueGrowth)}%</strong></p><p><span>OPERATING MARGIN</span><strong>{fmt.format(data.metrics.ebitMargin)}%</strong></p><p><span>CAPEX / REVENUE</span><strong>{fmt.format(data.metrics.capexPercentRevenue)}%</strong></p></div></div>
      <footer><span>Financials through {data.asOf}</span><span>{data.source}</span></footer>
    </article>,
    <article className="pitch-slide" key="valuation">
      <header><span>03 · INTRINSIC VALUE</span><h3>{financialUnsupported ? "A standard corporate DCF is not appropriate for this sector" : "The two terminal methods define a range—not a price target"}</h3></header>
      {financialUnsupported ? <div className="pitch-message"><strong>Use sector-specific valuation</strong><p>Review tangible book value, return on equity, regulatory capital, asset quality, funding costs, and dividends or residual income.</p></div> : <><div className="pitch-value-range"><div><span>MARKET PRICE</span><strong>{usd.format(model.marketPrice)}</strong></div><div><span>PERPETUAL GROWTH</span><strong>{perpetuity.valid ? usd.format(perpetuity.perShare) : "—"}</strong></div><div><span>EXIT MULTIPLE</span><strong>{multiple.valid ? usd.format(multiple.perShare) : "—"}</strong></div></div><p className="pitch-takeaway">Automated scenario range: <b>{lowValue === null || highValue === null ? "Unavailable" : `${usd.format(lowValue)}–${usd.format(highValue)}`}</b>. Reconcile the methods before drawing an investment conclusion.</p></>}
      <footer><span>WACC {pct2.format(calculateWacc(model).selectedWacc)}% · Terminal growth {fmt.format(model.terminalGrowth)}%</span><span>Scenario values only</span></footer>
    </article>,
    <article className="pitch-slide" key="comps">
      <header><span>04 · COMPARABLE COMPANIES</span><h3>Business-model fit matters more than the reported industry label</h3></header>
      <div className="pitch-comps-grid"><div><span>FOCUS COMPANY</span><strong>{data.company.symbol}</strong><small>{comparison?.nicheLabel || data.company.industry}</small></div><div><span>PEER MEDIAN GROWTH</span><strong>{medianGrowth === null ? "—" : `${fmt.format(medianGrowth)}%`}</strong><small>Latest annual period</small></div><div><span>PEER MEDIAN MARGIN</span><strong>{medianMargin === null ? "—" : `${fmt.format(medianMargin)}%`}</strong><small>Operating margin</small></div><div><span>PEER MEDIAN {financialUnsupported ? "P / E" : "EV / EBITDA"}</span><strong>{medianMultiple === null ? "—" : `${fmt.format(medianMultiple)}×`}</strong><small>Current price / latest annuals</small></div></div>
      <p className="pitch-peer-list">Selected peers · {(comparison?.selectedPeerSymbols || comparison?.peers.map((peer) => peer.symbol) || []).join(" · ") || "No validated peer set returned"}</p>
      <footer><span>Use forward, fiscal-aligned multiples for final work</span><span>Peer data may be incomplete</span></footer>
    </article>,
    <article className="pitch-slide" key="risks">
      <header><span>05 · RISK REVIEW</span><h3>The investment case depends on resolving the largest uncertainties</h3></header>
      <div className="pitch-risk-list">{risks.slice(0, 3).map((risk, index) => <div key={risk.title}><span>{String(index + 1).padStart(2, "0")} · {risk.level.toUpperCase()}</span><h4>{risk.title}</h4><p>{risk.detail}</p></div>)}</div>
      <footer><span>Review company filings and management guidance</span><span>Risks can affect cash flow and WACC</span></footer>
    </article>,
    <article className="pitch-slide" key="conclusion">
      <header><span>06 · DECISION FRAME</span><h3>The model identifies what must be true before capital is committed</h3></header>
      <div className="pitch-conclusion"><div><h4>Evidence to establish</h4><ul><li>Revenue growth and margins can coexist at the modeled scale.</li><li>Reinvestment produces returns above the cost of capital.</li><li>Debt, dilution, and refinancing remain manageable.</li></ul></div><div><h4>Model limitations</h4><ul><li>Later forecast years are automated estimates.</li><li>Peer multiples may not be forward or fiscal-aligned.</li><li>Missing or delayed source data can change the result.</li></ul></div></div>
      <p className="pitch-disclaimer">This deck is educational decision support. It is not personalized investment advice or an analyst price target.</p>
      <footer><span>{data.company.symbol} · {model.valuationDate}</span><span>Sources disclosed in the calculator</span></footer>
    </article>,
  ];
  return <div className="pitch-deck">
    <div className="deck-toolbar"><div><span>PITCH DECK</span><b>{activeSlide + 1} / {slides.length}</b></div><div><button type="button" onClick={() => setActiveSlide((current) => Math.max(0, current - 1))} disabled={activeSlide === 0}>← Previous</button><button type="button" onClick={() => setActiveSlide((current) => Math.min(slides.length - 1, current + 1))} disabled={activeSlide === slides.length - 1}>Next →</button><button type="button" className="deck-export" onClick={printDeck}>Print / Save PDF</button></div></div>
    <div className="deck-stage">{slides.map((slide, index) => <div className={index === activeSlide ? "active" : ""} key={slide.key}>{slide}</div>)}</div>
    <div className="deck-thumbnails" role="tablist" aria-label="Pitch deck slides">{["Cover", "Business", "Operations", "Valuation", "Comps", "Risks", "Decision"].map((label, index) => <button type="button" role="tab" aria-selected={activeSlide === index} className={activeSlide === index ? "active" : ""} key={label} onClick={() => setActiveSlide(index)}><span>{String(index + 1).padStart(2, "0")}</span>{label}</button>)}</div>
  </div>;
}

function CompetitorComparison({ data, embedded = false }: { data: CompanyData; embedded?: boolean }) {
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
  const financialCompany = isStandardDcfUnsupported(data.company);
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
  const means = {
    growth: peerMean(data, "revenueGrowth"),
    margin: peerMean(data, "operatingMargin"),
    marketCap: peerMean(data, "marketCap"),
    multiple: peerMean(data, "evToEbitda"),
    revenueMultiple: peerMean(data, "evToRevenue"),
    pe: peerMean(data, "pe"),
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
    financialCompany
      ? { label: "P / E", value: formatMetric(company.pe), detail: difference(company.pe, metrics.pe, "above", "below", "×") }
      : { label: "EV / EBITDA", value: formatMetric(company.evToEbitda), detail: difference(company.evToEbitda, metrics.multiple, "above", "below", "×") },
  ];
  const assessment = businessAssessment(data, company);
  const detailedComparison = buildBusinessComparison({
    company,
    peers,
    nicheLabel: comparison?.nicheLabel,
    capexPercentRevenue: data.metrics.capexPercentRevenue,
    operatingMargin: company.operatingMargin,
    peerMedianMargin: metrics.margin,
  });
  const rows = peers.length ? [company, ...peers] : [company];
  const fitLabel = (fit: Comparable["peerFit"]) => fit === "direct" ? "DIRECT FIT" : fit === "close" ? "CLOSE FIT" : fit === "adjacent" ? "ADJACENT" : "";
  return <section className={embedded ? "comps-analysis" : "sheet-section"} id="competitors">
    <div className="section-heading"><div>{!embedded && <span className="section-index">06</span>}<p>COMPS ANALYSIS</p><h2>Comparable-company analysis</h2></div><p className="section-description">Peers are selected from a business-model niche—not merely the reported industry label. Direct, close, and adjacent fits are identified so you can judge which valuation comparisons deserve the most weight.</p></div>
    <div className="peer-selection-note"><div><span>SELECTED BUSINESS NICHE</span><strong>{comparison?.nicheLabel || businessFocus(company)}</strong></div><p>{comparison?.selectionBasis || "The closest available public companies are selected using the company description, products, customers, and operating model."}</p>{Boolean(comparison?.operatingCompetitors?.length) && <small>Broader operating competitors—not primary valuation peers: {comparison?.operatingCompetitors?.join(" · ")}</small>}</div>
    <div className="business-review">
      <article><span>WHAT THE COMPANY DOES</span><h3>{comparison?.nicheLabel || businessFocus(company)}</h3><p>{company.description || data.company.description}</p></article>
      <article className="moat-card"><span>DOES IT HAVE A MOAT?</span><h3>{assessment.verdict}</h3><p>{assessment.mechanism} {assessment.financialSignal}</p><small>Verify: {assessment.verify}.</small></article>
      <article className="business-difference-card"><span>HOW THE BUSINESS DIFFERS</span><h3>{detailedComparison.title}</h3><p>{detailedComparison.summary}</p><div className="business-difference-grid">{detailedComparison.dimensions.map((dimension) => <div key={dimension.label}><b>{dimension.label}</b><p>{dimension.detail}</p></div>)}</div>{detailedComparison.peerModels.length > 0 && <div className="peer-model-list"><b>PEER-BY-PEER BUSINESS MODEL</b><div>{detailedComparison.peerModels.map((peer) => <section key={peer.symbol}><strong>{peer.symbol} · {peer.name}</strong><p>{peer.detail}</p></section>)}</div></div>}<small>Comparison lens: {detailedComparison.ruleTitle}. Verify segment revenue, customer concentration, and capital allocation in the latest filing before applying a peer multiple.</small></article>
    </div>
    <div className="peer-summary"><div><span>NICHE GROWTH BENCHMARK</span><strong>{comparison?.industryGrowthRate === null || comparison?.industryGrowthRate === undefined ? "—" : `${fmt.format(comparison.industryGrowthRate)}%`}</strong><small>Median recent peer revenue growth</small></div><div><span>{financialCompany ? "PEER MEDIAN P / E" : "PEER MEDIAN EV / EBITDA"}</span><strong>{financialCompany ? metrics.pe === null ? "—" : `${fmt.format(metrics.pe)}×` : metrics.multiple === null ? "—" : `${fmt.format(metrics.multiple)}×`}</strong><small>{financialCompany ? "Use with P/TBV, ROE, capital, and credit quality" : "Reference for the exit-multiple method"}</small></div><div><span>SELECTED PEER GROUP</span><strong>{(comparison?.selectedPeerSymbols || peers.map((peer) => peer.symbol)).join(" · ") || "Unavailable"}</strong><small>Narrowed by products, customers, and operating model</small></div></div>
    <div className="peer-table-wrap table-scroll"><table className="peer-table"><thead><tr><th>Company</th><th>Business focus</th><th>Market cap</th><th>Revenue growth</th><th>Operating margin</th><th>EV / Revenue</th><th>EV / EBITDA</th><th>P / E</th></tr></thead><tbody>
      {rows.map((peer, index) => <tr className={index === 0 ? "focus-company" : ""} key={peer.symbol}><td><b>{peer.symbol}</b><span>{peer.name}</span>{index === 0 && <em>FOCUS COMPANY</em>}</td><td className="business-focus-cell"><b>{index === 0 ? comparison?.nicheLabel || businessFocus(peer) : businessFocus(peer)}</b>{index > 0 && fitLabel(peer.peerFit) && <span className="peer-fit-indicator" aria-label={`Peer selection fit: ${fitLabel(peer.peerFit).toLowerCase()}`}>Peer fit: {fitLabel(peer.peerFit).toLowerCase()}</span>}{peer.peerRationale && <small>{peer.peerRationale}</small>}</td><td>{formatCap(peer.marketCap)}</td><td>{formatMetric(peer.revenueGrowth, "%")}</td><td>{formatMetric(peer.operatingMargin, "%")}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToRevenue)}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToEbitda)}</td><td>{formatMetric(peer.pe)}</td></tr>)}
      {peers.length > 0 && <tr className="peer-median"><td><b>PEER MEDIAN</b><span>{peers.length} returned companies</span></td><td>—</td><td>{formatCap(metrics.marketCap)}</td><td>{formatMetric(metrics.growth, "%")}</td><td>{formatMetric(metrics.margin, "%")}</td><td>{financialCompany ? "n/m" : formatMetric(metrics.revenueMultiple)}</td><td>{financialCompany ? "n/m" : formatMetric(metrics.multiple)}</td><td>{formatMetric(metrics.pe)}</td></tr>}
      {peers.length > 0 && <tr className="peer-mean"><td><b>PEER MEAN</b><span>Arithmetic average</span></td><td>—</td><td>{formatCap(means.marketCap)}</td><td>{formatMetric(means.growth, "%")}</td><td>{formatMetric(means.margin, "%")}</td><td>{financialCompany ? "n/m" : formatMetric(means.revenueMultiple)}</td><td>{financialCompany ? "n/m" : formatMetric(means.multiple)}</td><td>{formatMetric(means.pe)}</td></tr>}
    </tbody></table></div>
    {!peers.length && <div className="peer-empty">Comparable ratios were not returned by Nasdaq for this request. The primary DCF still works because peer data is optional.</div>}
    <h3 className="difference-title">How {company.symbol} differs from the peer median</h3>
    <div className="difference-grid">{insights.map((insight) => <article key={insight.label}><span>{insight.label}</span><strong>{insight.value}</strong><p>{insight.detail}</p></article>)}</div>
    <p className="peer-disclaimer">Peer mean is the arithmetic average and can be pulled upward or downward by an outlier; peer median is the middle observation and is usually more resistant to extremes. {financialCompany ? "EV/revenue and EV/EBITDA are marked not meaningful for banks and insurers. Compare P/TBV, P/E, ROE, regulatory capital, reserve or credit quality, and funding economics instead; this free dataset does not contain all of those sector-specific fields. " : ""}Revenue growth compares each company’s latest two annual periods. Multiples and margins use current market capitalization against the latest displayed annual financials—not LTM or forward consensus—and may not be comparable when earnings are negative, fiscal periods differ, or business mixes vary.</p>
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
  const [researchView, setResearchView] = useState<ResearchView>("comps");
  const [error, setError] = useState("");
  const rec = useMemo(() => recommendations(data), [data]);
  const perpetuity = useMemo(() => calculate(data, model, "perpetuity"), [data, model]);
  const multiple = useMemo(() => calculate(data, model, "multiple"), [data, model]);
  const result = perpetuity;
  const financialUnsupported = isStandardDcfUnsupported(data.company);
  const risks = useMemo(
    () => financialUnsupported ? financialSectorRiskAnalysis(data) : riskAnalysis(data, model, perpetuity, multiple),
    [data, financialUnsupported, model, perpetuity, multiple],
  );
  const latest = data.historical[data.historical.length - 1];
  const priceContext = marketPriceContext(data);
  const forecastConfidence = data.forecast
    ? data.businessAnalysis?.filing ? "Moderate" : "Low"
    : "Low";
  const turnaroundCaveat = data.metrics.ebitMargin < 0 && (model.forecastDrivers.at(-1)?.ebitMargin ?? 0) > 0
    ? ` The automatic scenario assumes EBIT margin improves from ${fmt.format(data.metrics.ebitMargin)}% in the latest period to ${fmt.format(model.forecastDrivers.at(-1)!.ebitMargin)}% in the final explicit year; that turnaround is not analyst consensus and should be replaced with a defensible operating plan.`
    : "";
  const forecastConfidenceDetail = data.forecast
    ? `Only the first two revenue years use an external consensus source; Years 3–6 and all margin, tax, D&A, capex, and working-capital drivers are editable model estimates.${data.businessAnalysis?.filing ? " Filing data was available for historical cross-checks." : " SEC filing data was unavailable for additional cross-checks."}${turnaroundCaveat}`
    : `No validated analyst revenue forecast was available; all six annual operating forecasts are editable model estimates.${turnaroundCaveat}`;
  const rotatingExample = LARGE_COMPANY_EXAMPLES[exampleIndex];
  type NumericModelKey = Exclude<keyof Model, "valuationDate" | "forecastDrivers">;
  const update = (key: NumericModelKey, value: number) => setModel((current) => ({ ...current, [key]: value }));
  const updateValuationDate = (value: string) => setModel((current) => ({ ...current, valuationDate: value }));
  const updateForecastDriver = (index: number, key: Exclude<keyof ForecastDriver, "periodEnd" | "source">, value: number) => setModel((current) => ({
    ...current,
    forecastDrivers: current.forecastDrivers.map((driver, driverIndex) => driverIndex === index ? { ...driver, [key]: value } : driver),
  }));

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
      setResearchView("comps");
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

  const actualPeriods = data.historical.slice(-5);
  const actualOffset = data.historical.length - actualPeriods.length;
  const actualValues = (value: (row: HistoricalRow, fullIndex: number) => number | null) => actualPeriods.map((row, index) => value(row, actualOffset + index));
  const grossProfit = (row: HistoricalRow) => row.cogs === undefined ? null : row.revenue - row.cogs;
  const operatingExpenses = (row: HistoricalRow) => {
    const gross = grossProfit(row);
    return gross === null ? null : gross - row.ebit;
  };
  const operatingTax = (row: HistoricalRow) => {
    const rate = historicalEffectiveTaxRate(row);
    return rate === null ? null : Math.max(0, row.ebit * rate / 100);
  };
  const tableRows: Array<{ label: string; actuals: Array<number | null>; values: Array<number | null>; terminal?: number | null; type?: "percent" | "factor" | "total" | "negative" }> = [
    { label: "Revenue", actuals: actualValues((row) => row.revenue), values: result.years.map((year) => year.revenue) },
    { label: "% YoY Growth", actuals: actualValues((_row, index) => historicalRevenueGrowth(data.historical, index)), values: result.years.map((year) => year.growth), type: "percent" },
    { label: "Less: Cost of Revenue", actuals: actualValues((row) => row.cogs ?? null), values: result.years.map((year) => year.costRevenue), type: "negative" },
    { label: "Cost of Revenue / Revenue", actuals: actualValues((row) => row.cogs === undefined || !row.revenue ? null : row.cogs / row.revenue * 100), values: result.years.map((year) => 100 - year.grossMargin), type: "percent" },
    { label: "Gross Profit", actuals: actualValues(grossProfit), values: result.years.map((year) => year.grossProfit), type: "total" },
    { label: "Gross Margin", actuals: actualValues((row) => row.grossMargin ?? null), values: result.years.map((year) => year.grossMargin), type: "percent" },
    { label: "Less: Operating Expenses", actuals: actualValues(operatingExpenses), values: result.years.map((year) => year.operatingExpenses), type: "negative" },
    { label: "Operating Expenses / Revenue", actuals: actualValues((row) => { const expenses = operatingExpenses(row); return expenses === null || !row.revenue ? null : expenses / row.revenue * 100; }), values: result.years.map((year) => year.operatingExpenses / year.revenue * 100), type: "percent" },
    { label: "Operating Income", actuals: actualValues((row) => row.ebit), values: result.years.map((year) => year.ebit), type: "total" },
    { label: "Operating Margin", actuals: actualValues((row) => row.ebitMargin), values: result.years.map((year) => year.margin), type: "percent" },
    { label: "Less: Tax on Operating Income", actuals: actualValues(operatingTax), values: result.years.map((year) => year.tax), type: "negative" },
    { label: "Operating Tax Rate", actuals: actualValues(historicalEffectiveTaxRate), values: result.years.map((year) => year.taxRate), type: "percent" },
    { label: "NOPAT", actuals: actualValues((row) => { const tax = operatingTax(row); return tax === null ? null : row.ebit - tax; }), values: result.years.map((year) => year.nopat), terminal: result.terminalNopat, type: "total" },
    { label: "Plus: Depreciation & Amortization", actuals: actualValues((row) => row.depreciation), values: result.years.map((year) => year.depreciation) },
    { label: "D&A / Revenue", actuals: actualValues((row) => row.revenue ? row.depreciation / row.revenue * 100 : null), values: result.years.map((year) => year.daPercent), type: "percent" },
    { label: "Less: Capital Expenditure", actuals: actualValues((row) => row.capex), values: result.years.map((year) => year.capex), type: "negative" },
    { label: "Capex / Revenue", actuals: actualValues((row) => row.capexPercentRevenue), values: result.years.map((year) => year.capexPercent), type: "percent" },
    { label: "Less: Changes in Net Working Capital", actuals: actualValues(() => null), values: result.years.map((year) => year.changeNwc), type: "negative" },
    { label: "Changes in NWC / Revenue", actuals: actualValues(() => null), values: result.years.map((year) => year.nwcPercent), type: "percent" },
    { label: "Plus: Changes in Net Long-Term Deferred Tax Liabilities", actuals: actualValues(() => null), values: result.years.map((year) => year.deferredTax) },
    { label: "Deferred Tax Change / Revenue", actuals: actualValues(() => null), values: result.years.map((year) => year.deferredTaxPercent), type: "percent" },
    { label: "Plus: Other Estimated Non-Cash Adjustments", actuals: actualValues(() => null), values: result.years.map((year) => year.otherNonCash) },
    { label: "Terminal Reinvestment / NOPAT", actuals: actualValues(() => null), values: result.years.map(() => null), terminal: result.terminalReinvestmentRate === null ? null : result.terminalReinvestmentRate * 100, type: "percent" },
    { label: "Unlevered Free Cash Flow (UFCF)", actuals: actualValues((row) => historicalUfcf(row, model.normalizedTaxRate)), values: result.years.map((year) => year.fcf), terminal: result.terminalFcf, type: "total" },
    { label: "% of FCF Discounted", actuals: actualValues(() => null), values: result.years.map((year) => year.weight * 100), type: "percent" },
    { label: "Mid-Year Discount Period", actuals: actualValues(() => null), values: result.years.map((year) => year.discountPeriod), type: "factor" },
    { label: "Discount Factor", actuals: actualValues(() => null), values: result.years.map((year) => year.discountFactor), type: "factor" },
    { label: "Present Value of Free Cash Flow", actuals: actualValues(() => null), values: result.years.map((year) => year.pv), terminal: result.pvForecast, type: "total" },
    { label: "EBITDA", actuals: actualValues((row) => row.ebit + row.depreciation), values: result.years.map((year) => year.ebitda), terminal: result.terminalEbitda, type: "total" },
  ];
  const formatCell = (value: number | null, type?: string) => {
    if (value === null || !Number.isFinite(value)) return "—";
    if (type === "percent") return `${fmt.format(value)}%`;
    if (type === "factor") return value < 1 ? value.toFixed(3) : fmt.format(value);
    if (type === "negative") return value < 0 ? `(${fmt.format(Math.abs(value))})` : fmt.format(value);
    return fmt.format(value);
  };

  const waccDetails = calculateWacc(model);
  const { equity, debt, equityWeight, debtWeight, costEquity, afterTaxCostDebt: afterTaxDebt, baseWacc: referenceWacc, selectedWacc } = waccDetails;
  const riskFree = model.riskFreeRate;
  const beta = model.beta;
  const equityRiskPremium = model.equityRiskPremium;
  const preTaxDebt = model.preTaxCostDebt;
  const equityContribution = costEquity * equityWeight;
  const debtContribution = afterTaxDebt * debtWeight;
  const workbookFormula: Record<WorkbookTab, string> = {
    dcf: "UFCF = EBIT × (1 − Tax Rate) + D&A − Capex − ΔNWC + Δ Deferred Tax + Other Non-Cash Adjustments",
    assumptions: "Green cells link to the editable inputs below the workbook",
    wacc: "Selected WACC = [E/(D+E) × (Risk-free rate + Beta × ERP)] + [D/(D+E) × Pre-tax debt cost × (1−Tax rate)] + Company-specific premium",
    valuation: "Equity Value = Enterprise Value + Cash − Debt − Other Non-Equity Claims",
    sensitivity: "Implied Share Price = Equity Value ÷ Fully Diluted Shares",
  };
  const assumptionSheet = [
    ["Valuation date", model.valuationDate, "Current date; editable"],
    ["Year 1 revenue growth", `${fmt.format(result.years[0].growth)}%`, data.forecast ? data.forecast.source : "Historical-growth fallback"],
    ["Year 2 revenue growth", `${fmt.format(result.years[1].growth)}%`, data.forecast ? data.forecast.source : "Modeled fade"],
    ["Years 3–6 revenue growth", result.years.slice(2).map((year) => `${fmt.format(year.growth)}%`).join(" · "), "Editable model estimates; independent of perpetual growth"],
    ["Forecast EBIT margins", model.forecastDrivers.map((driver) => `${fmt.format(driver.ebitMargin)}%`).join(" · "), "Editable by fiscal year"],
    ["Forecast tax rates", model.forecastDrivers.map((driver) => `${fmt.format(driver.taxRate)}%`).join(" · "), "Editable by fiscal year"],
    ["Forecast D&A / revenue", model.forecastDrivers.map((driver) => `${fmt.format(driver.daPercent)}%`).join(" · "), "Editable by fiscal year"],
    ["Forecast capex / revenue", model.forecastDrivers.map((driver) => `${fmt.format(driver.capexPercent)}%`).join(" · "), "Editable by fiscal year"],
    ["Forecast ΔNWC / revenue", model.forecastDrivers.map((driver) => `${fmt.format(driver.changeNwcPercent)}%`).join(" · "), "Automatic shortcut starts at 2% of incremental revenue; replace with a company-specific working-capital forecast"],
    ["Deferred tax & other non-cash", model.forecastDrivers.map((driver) => `${fmt.format(driver.deferredTaxPercent + driver.otherNonCashPercent)}%`).join(" · "), "Starts at 0%; add only documented non-cash items and keep dilution treatment consistent"],
    ["Selected WACC", `${fmt.format(selectedWacc)}%`, "Formula WACC plus the disclosed company-specific premium"],
    ["Perpetual growth", `${fmt.format(model.terminalGrowth)}%`, "Must remain below WACC"],
    ["Terminal ROIC", `${fmt.format(model.terminalRoic)}%`, "Terminal reinvestment equals perpetual growth ÷ terminal ROIC"],
    ["Exit EBITDA multiple", `${fmt.format(model.exitMultiple)}×`, "Compare with niche peers"],
    ["Cash & included investments", `${usd0.format(model.cash)}M`, "Latest available balance-sheet proxy"],
    ["Debt", `${usd0.format(model.shortDebt + model.longDebt)}M`, "Short-term plus long-term funded debt"],
    ["Other non-equity claims", `${usd0.format(model.preferredInterest)}M`, "Preferred stock and non-controlling interests when identified; operating leases are not automatically capitalized"],
    ["Share count used", `${fmt.format(model.shares)}M`, data.market.sharesSource || "Unverified free-data share-count proxy"],
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
  return <main className="sleek-app">
    <div className="site-intro" aria-hidden="true"><div><span>DCF</span><i/></div></div>
    <nav className="top-nav"><a href="#top" className="brand"><b>DCF</b><span>Valuation Studio</span></a><div className="nav-status"><i/>Public data · editable model</div></nav>
    <header id="top" className="calculator-header">
      <div className="hero-grid" aria-hidden="true"/><div className="hero-orbit orbit-one" aria-hidden="true"/><div className="hero-orbit orbit-two" aria-hidden="true"/>
      <div className="hero-copy">
        <p>PUBLIC-COMPANY VALUATION · INTERACTIVE MODEL</p>
        <h1><span>Value the business.</span><em>Price the cash flow.</em></h1>
        <div className="instructions"><b>Start with a ticker</b><span>The calculator builds six fiscal forecasts, values an exact five-year window, and shows perpetual-growth and exit-multiple scenarios side by side.</span></div>
        <form className="ticker-search" onSubmit={search}><label><span>TICKER</span><input aria-label="Ticker symbol" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder={`Try ${rotatingExample.symbol}`} /></label><button disabled={loading || !ticker.trim()}>{loading ? companyReady ? "BUILDING…" : "LOADING…" : "RUN MODEL"}<span>↗</span></button></form>
        {error && <div className="api-error"><b>Data connection:</b> {error}</div>}
        <small>Now rotating: {rotatingExample.name} ({rotatingExample.symbol}) · Every estimate remains visible and editable.</small>
      </div>
      <aside className="hero-methods" aria-label="Calculator coverage">
        <article><span>01</span><div><b>Forecast</b><small>Six fiscal periods</small></div></article>
        <article><span>02</span><div><b>Discount</b><small>Exact five-year window</small></div></article>
        <article><span>03</span><div><b>Stress test</b><small>Two terminal methods</small></div></article>
      </aside>
      <a className="hero-scroll" href="#output" aria-label="Scroll to calculator output">SCROLL <i>↓</i></a>
    </header>
    <div className="model-marquee" aria-hidden="true"><div><span>REVENUE</span><i>→</i><span>EBIT</span><i>→</i><span>NOPAT</span><i>→</i><span>UFCF</span><i>→</i><span>ENTERPRISE VALUE</span><i>→</i><span>EQUITY VALUE</span><i>→</i><span>IMPLIED VALUE / SHARE</span><i>→</i><span>REVENUE</span><i>→</i><span>EBIT</span><i>→</i><span>NOPAT</span><i>→</i><span>UFCF</span><i>→</i><span>ENTERPRISE VALUE</span><i>→</i><span>EQUITY VALUE</span><i>→</i><span>IMPLIED VALUE / SHARE</span><i>→</i></div></div>

    {!companyReady ? <section className="example-loader" aria-live="polite"><span>LOADING A REAL-COMPANY EXAMPLE</span><h2>{startingExample.name} · {startingExample.symbol}</h2><p>The calculator opens with a current large-company example. Type any supported public-company ticker above when you are ready.</p></section> : <>
    <section className="company-summary">
      <div><span>{data.company.exchange} · {data.company.symbol}</span><h2>{data.company.name}</h2><b className="company-description-label">{data.source === "Sample data" ? "WHAT THE COMPANY DOES · SAMPLE" : `WHAT THE COMPANY DOES · ${data.company.descriptionSource || "COMPANY PROFILE"}`}</b><p>{briefDescription(data.company.description)}</p><Link className="deep-analysis-link" href={`/company-analysis?symbol=${encodeURIComponent(data.company.symbol)}`}>{data.businessAnalysis?.filing ? "Open filing-based supply chain, customer concentration & credit screen →" : "Open company-analysis data availability & credit screen →"}</Link></div>
      <dl><div><dt>{priceContext.label}</dt><dd>{usd.format(model.marketPrice)}<small>{priceContext.detail}</small></dd></div><div><dt>Business niche</dt><dd>{data.comparison?.nicheLabel || data.company.industry}<small>{data.comparison?.industryExplanation || `Reported industry: ${data.company.industry}`}</small></dd></div><div><dt>Financials through</dt><dd>{data.asOf}</dd></div><div><dt>Company data source</dt><dd>{data.source}</dd></div></dl>
    </section>

    {financialUnsupported && <section className="sheet-section sector-notice"><div className="section-heading"><div><p>SECTOR LIMIT</p><h2>Standard unlevered DCF is disabled</h2></div></div><p>{data.company.name} is a financial institution. Debt, interest, and regulatory capital are operating inputs for banks and insurers, so treating debt as a financing claim and valuing UFCF would produce a misleading result. Use a dividend-discount, residual-income, excess-return, or price-to-book framework with regulatory-capital forecasts instead.</p></section>}

    {!financialUnsupported && <section className="sheet-section" id="valuation">
      <div className="section-heading"><div><span className="section-index">01</span><p>OUTPUT</p><h2>DCF valuation</h2></div><div className="unit-note">BOTH TERMINAL METHODS SHOWN TOGETHER</div></div>
      <div className="valuation-cards"><div><span>{priceContext.label}</span><strong>{usd.format(model.marketPrice)}</strong><small>{priceContext.detail}</small></div><div><span><DefinedTerm term="perpetualGrowth">Perpetual growth</DefinedTerm> scenario value</span><strong>{perpetuity.valid ? usd.format(perpetuity.perShare) : "—"}</strong>{perpetuity.valid && <ValueMove value={perpetuity.perShare} price={model.marketPrice}/>}</div><div><span><DefinedTerm term="exitMultiple">Exit multiple</DefinedTerm> scenario value</span><strong>{multiple.valid ? usd.format(multiple.perShare) : "—"}</strong>{multiple.valid && <ValueMove value={multiple.perShare} price={model.marketPrice}/>}</div></div>
      <div className={`forecast-confidence ${forecastConfidence.toLowerCase()}`}><b>FORECAST CONFIDENCE · {forecastConfidence.toUpperCase()}</b><p>{forecastConfidenceDetail} The outputs are scenario results, not price targets.</p></div>
      {selectedWacc <= model.terminalGrowth && <div className="api-error valuation-warning"><b>Assumption error:</b> WACC must be greater than terminal growth for the perpetual-growth method.</div>}
      {(model.terminalGrowth < 2 || model.terminalGrowth > 4 || model.terminalGrowth > model.riskFreeRate) && <div className="api-error valuation-warning"><b>Terminal-growth review:</b> This assumption should represent a sustainable long-run nominal growth rate and should generally not exceed the same-currency risk-free rate. Because it appears in the denominator of TV = Year-5 UFCF × (1 + g) ÷ (WACC − g), even a small change can materially affect terminal value.</div>}
      {((perpetuity.valid && perpetuity.rawEquityValue < 0) || (multiple.valid && multiple.rawEquityValue < 0)) && <div className="negative-explainer"><b>WHY A METHOD CAN SHOW $0 FOR COMMON EQUITY</b><p>Under at least one valid terminal method, enterprise value plus cash does not cover funded debt. The mathematical bridge is negative, but common stock has limited liability, so the displayed value stops at $0 rather than showing a negative share price.</p></div>}
      <div className="bridge-grid"><ValuationBridge title="Perpetual Growth Method" result={perpetuity} model={model} method="perpetuity" data={data}/><ValuationBridge title="Exit Multiple Method" result={multiple} model={model} method="multiple" data={data}/></div>
    </section>}

    <section className="sheet-section output-section" id="output">
      <div className="section-heading"><div><span className="section-index">02</span><p>OUTPUT</p><h2>DCF output</h2></div><p className="section-description">Rows vary the selected WACC by ±0.5 percentage points. The left table varies perpetual growth by ±1 point; the right varies the exit multiple by ±4×. Every cell reruns the complete valuation. The outlined middle cell is the current base case.</p></div>
      <OutputScreen data={data} model={model} perpetuity={perpetuity} multiple={multiple} risks={risks} forecastConfidence={forecastConfidence} forecastConfidenceDetail={forecastConfidenceDetail} financialUnsupported={financialUnsupported}/>
    </section>

    <section className="research-workspace" aria-labelledby="research-workspace-title">
      <div className="research-workspace-heading"><div><span>COMPS · PITCH</span><h2 id="research-workspace-title">Company research package for {data.company.symbol}</h2><p>Compare the company with its closest operating peers or review the investment case as a concise presentation.</p></div><small>LIVE TICKER-LINKED VIEWS</small></div>
      <div className="research-tabs" role="tablist" aria-label="Research package views">{([
        ["comps", "Comps analysis", "Peer selection and relative valuation"],
        ["pitch", "Pitch deck", "Seven-slide investment briefing"],
      ] as Array<[ResearchView, string, string]>).map(([view, label, detail]) => <button type="button" role="tab" aria-selected={researchView === view} className={researchView === view ? "active" : ""} key={view} onClick={() => setResearchView(view)}><span>{label}</span><small>{detail}</small></button>)}</div>
      <div className="research-panel" role="tabpanel" aria-label={`${researchView} view`}>
        {researchView === "comps" && <CompetitorComparison data={data} embedded/>}
        {researchView === "pitch" && <PitchDeck data={data} model={model} perpetuity={perpetuity} multiple={multiple} risks={risks} financialUnsupported={financialUnsupported}/>}
      </div>
    </section>

    {!financialUnsupported && <section className="sheet-section" id="build">
      <div className="section-heading"><div><span className="section-index">03</span><p>MODEL</p><h2>DCF workbook</h2></div><div className="unit-note">USD IN MILLIONS · LIVE TICKER-LINKED CELLS</div></div>
      <div className="method-audit">
        <div className="audit-heading"><div><span>FORMULA CHECK</span><h3>Standard unlevered DCF calculation</h3></div></div>
        <div className="six-step-grid">
          <article><span>01</span><b>Forecast UFCF</b><code>EBIT × (1−T) + D&amp;A − Capex − ΔNWC + deferred tax + other non-cash items</code></article>
          <article><span>02</span><b>Calculate terminal value</b><code>PG FCF: NOPAT₅ × (1−g/ROIC)<br/>PG TV: FCF₅ × (1+g) ÷ (WACC−g)<br/>Exit: EBITDA₅ × selected multiple</code></article>
          <article><span>03</span><b>Discount at WACC</b><code>EV = Σ[UFCFₜ ÷ (1+WACC)ᵗ] + TV ÷ (1+WACC)⁵</code></article>
          <article><span>04</span><b>Add non-operating assets</b><code>Enterprise value + cash &amp; included investments</code></article>
          <article><span>05</span><b>Subtract non-equity claims</b><code>− short debt − long debt − other non-equity claims</code></article>
          <article><span>06</span><b>Calculate value per share</b><code>Equity value ÷ fully diluted shares</code></article>
        </div>
        <p><b>Scope check:</b> This is an automated quick DCF, not a fully linked three-statement model. A transaction-grade forecast should link EBIT, D&amp;A, capex, and working capital through the income statement, balance sheet, and cash-flow statement. Every modeled shortcut remains visible and editable here.</p>
      </div>
      <div className="workbook-shell">
        <div className="formula-bar"><b>fx</b><code>{workbookFormula[workbookTab]}</code></div>
        <div className="workbook-panel" role="tabpanel" aria-label={`${workbookTab} worksheet`}>
          {workbookTab === "dcf" && <><div className="model-table-wrap"><table className="model-table historical-model-table"><thead><tr className="period-group-row"><th>PERIOD TYPE</th><th className="actual-group" colSpan={actualPeriods.length}>HISTORICAL ACTUALS / DERIVED RATIOS · REFERENCE ONLY</th><th className="forecast-group" colSpan={result.years.length}>FORECAST ESTIMATES · INCLUDED IN DCF</th><th>TERMINAL</th></tr><tr><th>DCF line item</th>{actualPeriods.map((period) => <th className="actual" key={period.fiscalDate || period.year}>{actualFiscalLabel(period)}</th>)}{result.years.map((year, index) => <th className={index === 0 ? "forecast-start" : ""} key={year.periodEnd}>{fiscalPeriodLabel(year.periodEnd)}</th>)}<th><DefinedTerm term="yearFive">AT YEAR 5</DefinedTerm></th></tr></thead><tbody>
            {tableRows.map((row) => <tr className={`${row.type === "total" ? "total" : ""} ${row.type === "percent" ? "percent-row" : ""}`} key={row.label}><td><DcfRowLabel label={row.label}/></td>{row.actuals.map((value, index) => <td className="actual" key={`${actualPeriods[index]?.fiscalDate || actualPeriods[index]?.year}-${row.label}`}>{formatCell(value, row.type)}</td>)}{row.values.map((value, index) => <td className={index === 0 ? "forecast-start" : ""} key={index}>{formatCell(value, row.type)}</td>)}<td>{formatCell(row.terminal ?? null, row.type)}</td></tr>)}
          </tbody></table></div><p className="historical-model-note"><b>Historical actuals are context—not valuation cash flows.</b> They are not discounted or included in enterprise value. Historical UFCF is approximated as reported operating cash flow − capex + after-tax interest; working-capital and other non-cash movements remain embedded in operating cash flow. Historical operating tax uses a capped effective-tax proxy when available. Forecast UFCF uses the visible line-by-line formula. The perpetuity terminal column normalizes reinvestment as growth ÷ terminal ROIC rather than carrying a temporary capex cycle forever.</p></>}
          {workbookTab === "assumptions" && <div className="model-table-wrap"><table className="workbook-table"><thead><tr><th>Assumption</th><th>Linked value</th><th>Source / treatment</th></tr></thead><tbody>{assumptionSheet.map(([label, value, source]) => <tr key={label}><td>{label}</td><td className="linked-cell">{value}</td><td>{source}</td></tr>)}</tbody></table></div>}
          {workbookTab === "wacc" && <div className="wacc-workbook">
            <div className="wacc-intro"><div><span>WHAT WACC ANSWERS</span><h3>What return do common-equity and funded-debt providers require?</h3><p>UFCF belongs to both shareholders and lenders, so this simplified model combines their required returns according to how much of the company is financed by common equity and funded debt. That combined rate discounts future cash flow into today’s value.</p></div><strong>{pct2.format(selectedWacc)}%<small>SELECTED MODEL WACC</small></strong></div>
            <div className="wacc-steps">
              <article><span>01</span><h4>Calculate shareholders’ return</h4><code>{pct2.format(riskFree)}% + ({pct2.format(beta)} × {pct2.format(equityRiskPremium)}%) = {pct2.format(costEquity)}%</code><p>Risk-free rate + Beta × Equity risk premium.</p></article>
              <article><span>02</span><h4>Calculate lenders’ after-tax return</h4><code>{pct2.format(preTaxDebt)}% × (1 − {pct2.format(model.normalizedTaxRate)}%) = {pct2.format(afterTaxDebt)}%</code><p>Interest can create a tax benefit, so debt cost is reduced by the normalized tax rate.</p></article>
              <article><span>03</span><h4>Measure the financing mix</h4><code>Equity {pct2.format(equityWeight * 100)}% · Debt {pct2.format(debtWeight * 100)}%</code><p>Equity value is market price × shares. Debt is short-term + long-term funded debt.</p></article>
              <article><span>04</span><h4>Weight and combine both returns</h4><code>({pct2.format(equityWeight * 100)}% × {pct2.format(costEquity)}%) + ({pct2.format(debtWeight * 100)}% × {pct2.format(afterTaxDebt)}%) = {pct2.format(referenceWacc)}%</code><p>The two contributions are {pct2.format(equityContribution)}% from equity and {pct2.format(debtContribution)}% from debt.</p></article>
              <article><span>05</span><h4>Apply the disclosed risk overlay</h4><code>{pct2.format(referenceWacc)}% + {pct2.format(model.companyRiskPremium)}% = {pct2.format(selectedWacc)}%</code><p>{/fallback|insufficient/i.test(data.market.betaSource || "") ? "Price history was insufficient for a regression beta, so the starting overlay fills the gap to the disclosed industry WACC. It is a data-coverage adjustment—not textbook CAPM—and should be replaced with a peer-derived bottom-up beta when possible." : "The company-specific premium is optional and is not part of textbook CAPM. Set it to 0% if the same risks are already reflected in beta or the cash-flow forecast."}</p></article>
            </div>
            <div className="model-table-wrap"><table className="workbook-table wacc-source-table"><thead><tr><th>WACC component</th><th>Value</th><th>How this number is obtained</th></tr></thead><tbody>
              <tr><td>Risk-free rate</td><td className="linked-cell">{pct2.format(riskFree)}%</td><td>{data.market.riskFreeAsOf ? `Long-term U.S. Treasury observation through ${data.market.riskFreeAsOf}. This is the starting return before equity risk.` : "Editable fallback because a current Treasury observation was unavailable."}</td></tr>
              <tr><td>Beta</td><td className="linked-cell">{pct2.format(beta)}×</td><td>{data.market.betaSource || "Editable estimate that scales the equity risk premium; verify with a current regression or peer beta."}</td></tr>
              <tr><td>Equity risk premium</td><td className="linked-cell">{pct2.format(equityRiskPremium)}%</td><td>{data.market.erpAsOf ? `Implied market equity premium reference as of ${data.market.erpAsOf}. This is the extra return required above the risk-free rate.` : "Editable fallback; refresh the market premium for the valuation date."}</td></tr>
              <tr><td>Cost of equity</td><td>{pct2.format(costEquity)}%</td><td>{pct2.format(riskFree)}% + ({pct2.format(beta)} × {pct2.format(equityRiskPremium)}%) = {pct2.format(costEquity)}%</td></tr>
              <tr><td>Market value of equity</td><td>{workbookMoney(equity)}</td><td>{usd.format(model.marketPrice)} per share × {fmt.format(model.shares)}M shares = {workbookMoney(equity)}</td></tr>
              <tr><td>Funded debt</td><td>{workbookMoney(debt)}</td><td>{workbookMoney(model.shortDebt)} short-term + {workbookMoney(model.longDebt)} long-term = {workbookMoney(debt)}</td></tr>
              <tr><td>Equity weight</td><td>{pct2.format(equityWeight * 100)}%</td><td>{workbookMoney(equity)} ÷ ({workbookMoney(equity)} + {workbookMoney(debt)}) = {pct2.format(equityWeight * 100)}%</td></tr>
              <tr><td>Pre-tax cost of debt proxy</td><td className="linked-cell">{pct2.format(preTaxDebt)}%</td><td>Editable input. It initially uses trailing interest ÷ average debt when available; otherwise it starts at the disclosed fallback.</td></tr>
              <tr><td>After-tax cost of debt</td><td>{pct2.format(afterTaxDebt)}%</td><td>{pct2.format(preTaxDebt)}% × (1 − {pct2.format(model.normalizedTaxRate)}%) = {pct2.format(afterTaxDebt)}%</td></tr>
              <tr><td>Debt weight</td><td>{pct2.format(debtWeight * 100)}%</td><td>{workbookMoney(debt)} ÷ ({workbookMoney(equity)} + {workbookMoney(debt)}) = {pct2.format(debtWeight * 100)}%</td></tr>
              <tr className="workbook-total"><td>Base formula WACC</td><td>{pct2.format(referenceWacc)}%</td><td>{pct2.format(equityContribution)}% equity contribution + {pct2.format(debtContribution)}% debt contribution = {pct2.format(referenceWacc)}%</td></tr>
              <tr><td><DefinedTerm term="companySpecificPremium">Company-specific premium</DefinedTerm></td><td className="linked-cell">{pct2.format(model.companyRiskPremium)}%</td><td>{/fallback|insufficient/i.test(data.market.betaSource || "") ? `Automatic insufficient-beta-history adjustment to the ${pct2.format(rec.wacc)}% industry WACC starting point. Replace with a peer-derived bottom-up beta when available.` : "Optional visible judgment adjustment for risks not already included elsewhere. Using it and also reducing cash flows for the same risk would double count."}</td></tr>
              <tr className="workbook-answer"><td>Selected model WACC</td><td>{pct2.format(selectedWacc)}%</td><td>{pct2.format(referenceWacc)}% base formula + {pct2.format(model.companyRiskPremium)}% premium = {pct2.format(selectedWacc)}%</td></tr>
            </tbody></table></div><p className="workbook-warning">The clearest items to verify are beta and pre-tax debt cost. When sufficient price history exists, beta starts with a five-year monthly price-return regression against SPY and is adjusted one-third toward 1.0; otherwise the model identifies a neutral 1.0 fallback and a separate industry-risk overlay. For a transaction-grade WACC, use split- and dividend-adjusted total returns or a peer-derived bottom-up beta, and replace trailing interest expense with a forward bond yield, borrowing rate, or credit-spread estimate.</p>
          </div>}
          {workbookTab === "valuation" && <div className="model-table-wrap"><table className="workbook-table valuation-workbook"><thead><tr><th>Valuation bridge</th><th>Perpetual growth</th><th>Exit multiple</th></tr></thead><tbody>{valuationSheet.map(([label, perpetuityValue, multipleValue]) => <tr className={["Enterprise value", "Equity value"].includes(String(label)) ? "workbook-total" : ""} key={String(label)}><td>{label}</td><td>{perpetuity.valid ? workbookMoney(Number(perpetuityValue)) : "—"}</td><td>{multiple.valid ? workbookMoney(Number(multipleValue)) : "—"}</td></tr>)}<tr><td>Share count used</td><td>{fmt.format(model.shares)}M</td><td>{fmt.format(model.shares)}M</td></tr><tr className="workbook-answer"><td>Implied value per share</td><td>{perpetuity.valid ? usd.format(perpetuity.perShare) : "—"}</td><td>{multiple.valid ? usd.format(multiple.perShare) : "—"}</td></tr></tbody></table><p className="workbook-warning">Share source: {data.market.sharesSource || "market-cap-derived proxy; verify current and fully diluted shares"}. Per-share value equals common-equity value divided by the current fully diluted share count, including options, warrants, restricted stock, convertibles, and other dilutive securities where applicable.</p></div>}
          {workbookTab === "sensitivity" && <div className="sensitivity-grid workbook-sensitivity"><SensitivityTable data={data} model={model} method="perpetuity"/><SensitivityTable data={data} model={model} method="multiple"/></div>}
        </div>
        <div className="workbook-tabs" role="tablist" aria-label="DCF workbook sheets">{([
          ["dcf", "DCF Model"], ["assumptions", "Assumptions"], ["wacc", "WACC"], ["valuation", "Valuation"], ["sensitivity", "Sensitivity"],
        ] as Array<[WorkbookTab, string]>).map(([tab, label]) => <button type="button" role="tab" aria-selected={workbookTab === tab} className={workbookTab === tab ? "active" : ""} key={tab} onClick={() => setWorkbookTab(tab)}>{label}</button>)}</div>
      </div>
      <p className="table-footnote"><b>At Year 5</b> means the point exactly five years after the valuation date—not simply the fifth forecast column. The model blends the two surrounding fiscal forecasts when necessary and uses a standard partial-year, mid-year discounting convention.</p>
    </section>}

    {!financialUnsupported && <section className="sheet-section" id="assumptions">
      <div className="section-heading"><div><span className="section-index">04</span><p>INPUTS</p><h2>Editable assumptions</h2></div><div className="unit-note">GREEN CELLS ARE EDITABLE</div></div>
      <div className="recommendation"><b>{data.comparison?.nicheLabel || data.company.industry} starting point</b><p>{rec.note}</p>{data.forecast ? <span>Years 1–2 start with {data.forecast.source} revenue estimates as of {data.forecast.asOf || "the displayed source date"}. Years 3–6 are clearly labeled website estimates. Every annual driver is editable below, and perpetual growth does not alter any explicit forecast year.</span> : <span>No validated analyst forecast was available. All six years begin as visible, editable model estimates rather than being presented as consensus.</span>}<span> The automatic working-capital shortcut assumes 2% of incremental revenue. Deferred tax and other non-cash adjustments start at 0%; replace these with a company-specific balance-sheet build and documented items such as stock compensation when material, while also updating dilution consistently.</span></div>
      <div className="forecast-editor"><div className="sheet-bar">Fiscal forecast drivers · each green cell is editable</div><div className="table-scroll"><table><thead><tr><th>Driver</th>{model.forecastDrivers.map((driver) => <th key={driver.periodEnd}>{fiscalPeriodLabel(driver.periodEnd)}</th>)}</tr></thead><tbody>{([
        ["Revenue growth", "revenueGrowth"], ["Gross margin", "grossMargin"], ["EBIT margin", "ebitMargin"], ["Tax rate", "taxRate"], ["D&A / revenue", "daPercent"], ["Capex / revenue", "capexPercent"], ["ΔNWC / revenue", "changeNwcPercent"], ["Deferred tax / revenue", "deferredTaxPercent"], ["Other non-cash / revenue", "otherNonCashPercent"],
      ] as Array<[string, Exclude<keyof ForecastDriver, "periodEnd" | "source">]>).map(([label, key]) => <tr key={key}><th><DcfRowLabel label={label}/></th>{model.forecastDrivers.map((driver, index) => <td key={driver.periodEnd}><input aria-label={`${label} ${driver.periodEnd}`} type="number" step="0.1" value={driver[key]} onChange={(event) => updateForecastDriver(index, key, Number(event.target.value))}/><span>%</span></td>)}</tr>)}<tr className="forecast-source-row"><th>Source status</th>{model.forecastDrivers.map((driver) => <td key={driver.periodEnd}>{driver.source}</td>)}</tr></tbody></table></div></div>
      <div className="assumption-grid">
        <DateField value={model.valuationDate} help="Sets the start of the exact five-year valuation window. It changes the partial weighting of the first and sixth fiscal-year forecasts." onChange={updateValuationDate}/>
        <NumberField label="Normalized tax rate for WACC" term="taxRate" value={model.normalizedTaxRate} suffix="%" help="Used only for the interest tax shield in WACC. Annual operating tax rates are editable in the forecast grid." onChange={(value) => update("normalizedTaxRate", value)}/>
        <NumberField label="Risk-free rate" term="riskFreeRate" value={model.riskFreeRate} suffix="%" help="Current long-term Treasury proxy when available; editable for the valuation date." onChange={(value) => update("riskFreeRate", value)}/>
        <NumberField label="Beta" term="beta" value={model.beta} suffix="×" help="Equity market sensitivity. Verify the period, frequency, and peer unlevering method before using it in a high-stakes valuation." onChange={(value) => update("beta", value)}/>
        <NumberField label="Equity risk premium" term="equityRiskPremium" value={model.equityRiskPremium} suffix="%" help="Current implied market premium when available; editable." onChange={(value) => update("equityRiskPremium", value)}/>
        <NumberField label="Pre-tax cost of debt" term="preTaxCostOfDebt" value={model.preTaxCostDebt} suffix="%" help="Use a forward borrowing rate or bond yield when available. The automatic value may be a trailing interest-expense proxy." onChange={(value) => update("preTaxCostDebt", value)}/>
        <NumberField label="Company-specific risk premium" value={model.companyRiskPremium} suffix="%" help={/fallback|insufficient/i.test(data.market.betaSource || "") ? `Beta history was insufficient, so this starts at the gap between formula WACC and the ${pct2.format(rec.wacc)}% industry WACC starting point. Replace it with a bottom-up beta when possible; do not also penalize the same risk in cash flows.` : "Optional judgment adjustment. It starts at 0% to avoid automatically double counting risks already reflected in beta, borrowing costs, or cash-flow forecasts."} onChange={(value) => update("companyRiskPremium", value)}/>
        <NumberField label="Terminal growth" term="terminalGrowth" value={model.terminalGrowth} suffix="%" help="Long-run growth after Year 5. It must remain below WACC and should generally not exceed the same-currency risk-free rate." onChange={(value) => update("terminalGrowth", value)}/>
        <NumberField label="Terminal ROIC" term="terminalRoic" value={model.terminalRoic} suffix="%" help="Long-run return on new invested capital. The automatic starting point equals WACC, so new perpetual investment creates no excess value. Use a higher value only when durable competitive advantages support it." onChange={(value) => update("terminalRoic", value)}/>
        <NumberField label="Exit EBITDA multiple" term="exitMultiple" value={model.exitMultiple} suffix="×" help="Year 5 EBITDA valuation multiple used in the exit-multiple method." onChange={(value) => update("exitMultiple", value)}/>
        <NumberField label="Market price used for comparison" term="marketPrice" value={model.marketPrice} suffix="$" help={`${priceContext.detail}. This input only calculates upside or downside; it does not change intrinsic value.`} onChange={(value) => update("marketPrice", value)}/>
        <NumberField label="Cash and included investments" term="cash" value={model.cash} suffix="$M" help="Cash and marketable investments added in the enterprise-to-equity bridge. Reduce this input if part of the balance is required to operate the business rather than being excess cash." onChange={(value) => update("cash", value)}/>
        <NumberField label="Short-term debt" term="fundedDebt" value={model.shortDebt} suffix="$M" help="Current borrowings subtracted in the enterprise-to-equity bridge." onChange={(value) => update("shortDebt", value)}/>
        <NumberField label="Long-term debt" term="fundedDebt" value={model.longDebt} suffix="$M" help="Non-current borrowings subtracted in the enterprise-to-equity bridge." onChange={(value) => update("longDebt", value)}/>
        <NumberField label="Preferred & minority interests" term="fundedDebt" value={model.preferredInterest} suffix="$M" help="Other non-equity claims subtracted after funded debt. Preferred stock and non-controlling interests are included when SEC facts identify them. Operating leases are not automatically added because consistent capitalization also requires lease-adjusted EBIT, D&A, capex, and cash flow." onChange={(value) => update("preferredInterest", value)}/>
        <NumberField label="Share count used" term="dilutedShares" value={model.shares} suffix="M" help={`${data.market.sharesSource || "Free-data proxy"}. Replace it when a newer fully diluted share count is available.`} onChange={(value) => update("shares", value)}/>
      </div>
      <div className="assumption-bottom"><div className="wacc-table"><div className="sheet-bar"><DefinedTerm term="wacc">WACC</DefinedTerm> formula reconciliation</div><div><span><DefinedTerm term="riskFreeRate">Risk-free rate</DefinedTerm></span><b>{pct2.format(riskFree)}%</b></div><div><span><DefinedTerm term="beta">Beta</DefinedTerm></span><b>{pct2.format(beta)}×</b></div><div><span><DefinedTerm term="equityRiskPremium">Equity risk premium</DefinedTerm></span><b>{pct2.format(equityRiskPremium)}%</b></div><div><span><DefinedTerm term="costOfEquity">Cost of equity</DefinedTerm> = Rf + β × ERP</span><b>{pct2.format(costEquity)}%</b></div><div><span><DefinedTerm term="equityWeight">Equity / capital</DefinedTerm></span><b>{pct2.format(equityWeight * 100)}%</b></div><div><span>Equity contribution = cost × weight</span><b>{pct2.format(equityContribution)}%</b></div><div><span><DefinedTerm term="preTaxCostOfDebt">Pre-tax cost of debt</DefinedTerm></span><b>{pct2.format(preTaxDebt)}%</b></div><div><span>After-tax debt cost</span><b>{pct2.format(afterTaxDebt)}%</b></div><div><span><DefinedTerm term="debtWeight">Debt / capital</DefinedTerm></span><b>{pct2.format(debtWeight * 100)}%</b></div><div><span>Debt contribution = cost × weight</span><b>{pct2.format(debtContribution)}%</b></div><div><span>Base formula WACC</span><b>{pct2.format(referenceWacc)}%</b></div><div><span><DefinedTerm term="companySpecificPremium">Company-specific premium</DefinedTerm></span><b>{pct2.format(model.companyRiskPremium)}%</b></div><div className="total"><span>Selected <DefinedTerm term="wacc">WACC</DefinedTerm></span><b>{pct2.format(selectedWacc)}%</b></div><small>Base WACC equals the equity contribution plus the debt contribution. The selected WACC then adds the visible optional premium. Open the WACC workbook tab to see every formula with the actual numbers used.</small></div>
        <div className="data-check"><div className="sheet-bar">Data checks</div><ul>{(data.qualityNotes?.length ? data.qualityNotes : ["Sample data is active. Enter a ticker to load current public-company data."]).map((note) => <li key={note}>{note}</li>)}</ul></div>
      </div>
    </section>}

    <section className="sheet-section" id="price-history">
      <div className="section-heading"><div><span className="section-index">05</span><p>MARKET DATA</p><h2>Stock price history</h2></div><p className="section-description">{data.source === "Sample data" ? "This is an illustrative company, so it does not have a real IPO date." : data.company.ipoDate ? `${data.company.name} first traded publicly on ${longDate(data.company.ipoDate)}.` : `A reliable public-market debut date was not available for ${data.company.name}.`} Select a time range and switch between daily, weekly, or monthly closing prices.</p></div>
      <StockPriceChart points={data.market.priceHistory || []} symbol={data.company.symbol}/>
    </section>

    <CompanyNews symbol={data.company.symbol} name={data.company.name}/>

    <section className="sheet-section" id="risks">
      <div className="section-heading"><div><span className="section-index">07</span><h2>Potential risks</h2></div><p className="section-description">{financialUnsupported ? "These are sector-specific review areas, not outputs from the disabled corporate DCF. Verify regulatory capital, asset quality, funding, liquidity, and material risks in company filings." : "Each card explains the available evidence, what the risk means for the business, and how it could affect the DCF. Verify material risks in company filings."}</p></div>
      <div className="risk-grid">{risks.map((risk) => <article key={risk.title}><span className={`risk-pill ${risk.level}`}>{risk.level}</span><h3>{risk.title}</h3><p>{risk.detail}</p></article>)}</div>
      <div className="decision-checklist"><h3>Investment-decision checklist</h3><ul><li>Read the latest annual report, risk factors, and management guidance.</li><li>Map revenue, suppliers, and operations by country.</li><li>Compare assumptions with direct peers and a full business cycle.</li><li>Stress-test dilution, acquisitions, regulation, and refinancing.</li><li>Define the evidence that would invalidate the thesis.</li><li>Require a margin of safety appropriate for forecast uncertainty.</li></ul></div>
    </section>

    <footer><span>Educational decision support only—not personalized investment advice.</span><span>MODEL V2 · DATA MAY BE DELAYED</span></footer>
    </>}
  </main>;
}
