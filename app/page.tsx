"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CompanyNavigation from "@/app/components/company-navigation";
import { DateField, NumberField } from "@/app/components/dcf/assumption-fields";
import { DcfRowLabel, DefinedTerm } from "@/app/components/dcf/defined-term";
import PitchDeck from "@/app/components/dcf/pitch-deck";
import OutputScreen from "@/app/components/dcf/output-screen";
import { storeCompanyData, storeResearchData } from "@/lib/client/company-storage";
import { apiErrorMessage } from "@/lib/client/api-error";
import type { CompanyData, HistoricalRow, PricePoint } from "@/lib/company-data";
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
import { financialSectorRiskAnalysis, riskAnalysis } from "@/lib/risk-analysis";

type Model = DcfModel;
type Method = DcfMethod;
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
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validMedian = (values: Array<number | null>) => {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

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

function EquationLine({ operator, label, value, emphasis = "" }: { operator: string; label: ReactNode; value: string; emphasis?: "total" | "answer" | "" }) {
  return <div className={`equation-line ${emphasis}`}><i aria-hidden="true">{operator}</i><span>{label}</span><b>{value}</b></div>;
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
  return <section className="valuation-equation">
    <header><h3>{title}</h3><span>{method === "perpetuity" ? "Cash-flow based" : "Market-multiple based"}</span></header>
    {!result.valid && <div className="invalid-method"><b>No valid {method === "perpetuity" ? "perpetual-growth" : "exit-multiple"} value</b><p>{result.invalidReason} Correct the highlighted valuation assumptions before relying on this method.</p></div>}
    {method === "perpetuity" ? <>
      <div className="terminal-equation"><div><span>Normalized terminal <DefinedTerm term="ufcf">FCF</DefinedTerm></span><code>{fmt.format(result.terminalNopat)} × (1 − {fmt.format(model.terminalGrowth)}% ÷ {fmt.format(model.terminalRoic)}%)</code></div><b>{validMoney(result.terminalFcf)}</b></div>
      <div className="terminal-equation"><div><span><DefinedTerm term="terminalValue">Terminal value</DefinedTerm></span><code>{fmt.format(result.terminalFcf)} × (1 + {fmt.format(model.terminalGrowth)}%) ÷ ({fmt.format(result.waccPercent)}% − {fmt.format(model.terminalGrowth)}%)</code></div><b>{validMoney(result.terminalValue)}</b></div>
      <div className="equation-context"><span>Growth <b>{fmt.format(model.terminalGrowth)}%</b></span><span><DefinedTerm term="terminalRoic">ROIC</DefinedTerm> <b>{fmt.format(model.terminalRoic)}%</b></span><span>Reinvestment <b>{result.terminalReinvestmentRate === null ? "—" : `${fmt.format(result.terminalReinvestmentRate * 100)}%`}</b></span><span>Peer growth <b>{industryGrowth === null ? "—" : `${fmt.format(industryGrowth)}%`}</b></span><span>Implied exit multiple <b>{impliedExitMultiple === null ? "—" : `${fmt.format(impliedExitMultiple)}×`}</b></span></div>
    </> : <>
      <div className="terminal-equation"><div><span><DefinedTerm term="terminalValue">Terminal value</DefinedTerm></span><code>{fmt.format(result.terminalEbitda)} Year-5 EBITDA × {fmt.format(model.exitMultiple)}×</code></div><b>{validMoney(result.terminalValue)}</b></div>
      <div className="equation-context"><span>Year-5 <DefinedTerm term="ebitda">EBITDA</DefinedTerm> <b>{usd0.format(result.terminalEbitda)}M</b></span><span>Exit multiple <b>{fmt.format(model.exitMultiple)}×</b></span><span>Peer median <b>{medianMultiple === null ? "—" : `${fmt.format(medianMultiple)}×`}</b></span><span>Peer range <b>{peerMultiples.length ? `${fmt.format(Math.min(...peerMultiples))}–${fmt.format(Math.max(...peerMultiples))}×` : "—"}</b></span><span>Implied growth <b>{impliedGrowth === null ? "—" : `${fmt.format(impliedGrowth)}%`}</b></span></div>
    </>}
    <div className="equation-flow">
      <EquationLine operator="" label={<><DefinedTerm term="pv">PV</DefinedTerm> of forecast <DefinedTerm term="ufcf">UFCF</DefinedTerm></>} value={`${usd0.format(result.pvForecast)}M`}/>
      <EquationLine operator="+" label={<><DefinedTerm term="pv">PV</DefinedTerm> of terminal value</>} value={validMoney(result.pvTerminal)}/>
      <EquationLine operator="=" label={<DefinedTerm term="enterpriseValue">Enterprise value</DefinedTerm>} value={validMoney(result.enterpriseValue)} emphasis="total"/>
      <EquationLine operator="+" label="Cash" value={`${usd0.format(model.cash)}M`}/>
      <EquationLine operator="−" label="Short-term debt" value={`${usd0.format(model.shortDebt)}M`}/>
      <EquationLine operator="−" label="Long-term debt" value={`${usd0.format(model.longDebt)}M`}/>
      <EquationLine operator="−" label="Other non-equity claims" value={`${usd0.format(model.preferredInterest)}M`}/>
      <EquationLine operator="=" label={<DefinedTerm term="equityValue">Equity value</DefinedTerm>} value={validMoney(result.equityValue)} emphasis="total"/>
      <EquationLine operator="÷" label={<DefinedTerm term="dilutedShares">Diluted shares</DefinedTerm>} value={`${fmt.format(model.shares)}M`}/>
      <EquationLine operator="=" label="Implied price per share" value={result.valid ? usd.format(result.perShare) : "—"} emphasis="answer"/>
    </div>
  </section>;
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


export default function Home() {
  const [ticker, setTicker] = useState("");
  const [data, setData] = useState<CompanyData>(demo);
  const [model, setModel] = useState<Model>(() => buildModel(demo));
  const [loading, setLoading] = useState(false);
  const [companyReady, setCompanyReady] = useState(false);
  const [startingExample, setStartingExample] = useState(LARGE_COMPANY_EXAMPLES[0]);
  const [workbookTab, setWorkbookTab] = useState<WorkbookTab>("dcf");
  const [activeWorkspace, setActiveWorkspace] = useState<"calculations" | "assumptions" | "workbook" | "presentation" | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [excelExportError, setExcelExportError] = useState("");
  const [error, setError] = useState("");
  const companyRequestController = useRef<AbortController | null>(null);
  const companyRequestVersion = useRef(0);
  const dailyHistoryRetries = useRef(new Set<string>());
  const rec = useMemo(() => recommendations(data), [data]);
  const perpetuity = useMemo(() => calculate(data, model, "perpetuity"), [data, model]);
  const multiple = useMemo(() => calculate(data, model, "multiple"), [data, model]);
  const result = perpetuity;
  const financialUnsupported = isStandardDcfUnsupported(data.company);
  const risks = useMemo(
    () => financialUnsupported ? financialSectorRiskAnalysis(data) : riskAnalysis(data, model, perpetuity, multiple),
    [data, financialUnsupported, model, perpetuity, multiple],
  );
  const priceContext = marketPriceContext(data);
  const forecastConfidence = data.forecast
    ? data.businessAnalysis?.filing ? "Moderate" : "Low"
    : "Low";
  const turnaroundCaveat = data.metrics.ebitMargin < 0 && (model.forecastDrivers.at(-1)?.ebitMargin ?? 0) > 0
    ? ` The automatic scenario assumes EBIT margin improves from ${fmt.format(data.metrics.ebitMargin)}% in the latest period to ${fmt.format(model.forecastDrivers.at(-1)!.ebitMargin)}% in the final explicit year; that turnaround is not analyst consensus and should be replaced with a defensible operating plan.`
    : "";
  const forecastConfidenceDetail = data.forecast
    ? `Only the first two revenue years use an external consensus source; Years 3–6 and all margin, tax, D&A, capex, and working-capital drivers are editable model estimates.${data.businessAnalysis?.filing ? " Filing data was available." : " SEC filing data was unavailable."}${turnaroundCaveat}`
    : `No validated analyst revenue forecast was available; all six annual operating forecasts are editable model estimates.${turnaroundCaveat}`;
  type NumericModelKey = Exclude<keyof Model, "valuationDate" | "forecastDrivers">;
  const update = (key: NumericModelKey, value: number) => setModel((current) => ({ ...current, [key]: value }));
  const updateValuationDate = (value: string) => setModel((current) => ({ ...current, valuationDate: value }));
  const updateForecastDriver = (index: number, key: Exclude<keyof ForecastDriver, "periodEnd" | "source">, value: number) => setModel((current) => ({
    ...current,
    forecastDrivers: current.forecastDrivers.map((driver, driverIndex) => driverIndex === index ? { ...driver, [key]: value } : driver),
  }));

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const requested = new URLSearchParams(window.location.search).get("symbol")?.trim().toUpperCase();
      const previousIndex = sessionStorage.getItem("dcf:example-index");
      const initialIndex = previousIndex === null ? 0 : (Number(previousIndex) + 1) % LARGE_COMPANY_EXAMPLES.length;
      sessionStorage.setItem("dcf:example-index", String(initialIndex));
      const initialCompany = requested && /^[A-Z0-9.\-]{1,12}$/.test(requested)
        ? { symbol: requested, name: requested }
        : LARGE_COMPANY_EXAMPLES[initialIndex];
      setStartingExample(initialCompany);
      void loadCompany(initialCompany.symbol);
    });
    return () => {
      active = false;
      companyRequestController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!companyReady) return;
    storeCompanyData(data);
  }, [companyReady, data]);

  useEffect(() => {
    if (!companyReady) return;
    storeResearchData({ symbol: data.company.symbol, risks });
  }, [companyReady, data.company.symbol, risks]);

  useEffect(() => {
    if (!companyReady || data.source === "Sample data") return;
    const points = data.market.priceHistory || [];
    const symbol = data.company.symbol;
    if (points.length >= 8 && !hasDailyPriceDensity(points) && !dailyHistoryRetries.current.has(symbol)) {
      // Fast Refresh can preserve the older monthly-only response after the API
      // is upgraded. Refresh that ticker once so Daily and Weekly are real data.
      dailyHistoryRetries.current.add(symbol);
      void loadCompany(symbol);
    }
  }, [companyReady, data.company.symbol, data.market.priceHistory, data.source]);

  async function loadCompany(symbol: string) {
    companyRequestController.current?.abort();
    const controller = new AbortController();
    const requestVersion = companyRequestVersion.current + 1;
    companyRequestController.current = controller;
    companyRequestVersion.current = requestVersion;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal });
      const json = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(json, "Unable to load company."));
      if (requestVersion !== companyRequestVersion.current) return;
      setData(json);
      setModel(buildModel(json));
      setCompanyReady(true);
      window.history.replaceState(null, "", `/?symbol=${encodeURIComponent(json.company.symbol)}`);
    } catch (caught) {
      if (controller.signal.aborted || requestVersion !== companyRequestVersion.current) return;
      setError(caught instanceof Error ? caught.message : "Unable to load company.");
    } finally {
      if (requestVersion === companyRequestVersion.current) {
        if (companyRequestController.current === controller) companyRequestController.current = null;
        setLoading(false);
      }
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

  async function exportExcel() {
    setExportingExcel(true);
    setExcelExportError("");
    try {
      const response = await fetch("/api/export-dcf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: {
            symbol: data.company.symbol,
            name: data.company.name,
            exchange: data.company.exchange,
            industry: data.company.industry,
          },
          source: data.source,
          asOf: data.asOf,
          sharesSource: data.market.sharesSource,
          metrics: { revenue: data.metrics.revenue },
          historical: data.historical,
          model,
          comparison: data.comparison ? {
            nicheLabel: data.comparison.nicheLabel,
            peers: data.comparison.peers,
          } : undefined,
        }),
      });
      if (!response.ok) {
        const message = await response.json().catch(() => ({}));
        throw new Error(apiErrorMessage(message, "Unable to create the Excel model."));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${data.company.symbol}-DCF-Model.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setExcelExportError(caught instanceof Error ? caught.message : "Unable to create the Excel model.");
    } finally {
      setExportingExcel(false);
    }
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
    <CompanyNavigation symbol={companyReady ? data.company.symbol : undefined} name={companyReady ? data.company.name : undefined} active="model"/>
    <header id="top" className="calculator-header">
      <div className="hero-copy">
        <h1><span>DCF Calculator</span></h1>
        <form className="ticker-search" onSubmit={search}><label><span>Ticker</span><input aria-label="Ticker symbol" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="e.g. AAPL" /></label><button disabled={loading || !ticker.trim()}>{loading ? companyReady ? "Building…" : "Loading…" : "Build DCF"}</button></form>
        {error && <div className="api-error"><b>Data connection:</b> {error}</div>}
      </div>
    </header>

    {!companyReady ? <section className="example-loader" aria-live="polite"><span>Loading company data</span><h2>{startingExample.name === startingExample.symbol ? startingExample.symbol : `${startingExample.name} · ${startingExample.symbol}`}</h2><p>Retrieving public financial statements, market data, and available forecast inputs.</p></section> : <div className="model-pages">
    {financialUnsupported && <section className="sheet-section sector-notice"><div className="section-heading"><div><p>SECTOR LIMIT</p><h2>Standard unlevered DCF is disabled</h2></div></div><p>{data.company.name} is a financial institution. Debt, interest, and regulatory capital are operating inputs for banks and insurers, so treating debt as a financing claim and valuing UFCF would produce a misleading result. Use a dividend-discount, residual-income, excess-return, or price-to-book framework with regulatory-capital forecasts instead.</p></section>}

    {!financialUnsupported && <section className="sheet-section output-section" id="output">
      {selectedWacc <= model.terminalGrowth && <div className="api-error valuation-warning"><b>Assumption error:</b> WACC must be greater than terminal growth for the perpetual-growth method.</div>}
      {(model.terminalGrowth < 2 || model.terminalGrowth > 4 || model.terminalGrowth > model.riskFreeRate) && <div className="api-error valuation-warning"><b>Terminal-growth review:</b> This assumption should represent a sustainable long-run nominal growth rate and should generally not exceed the same-currency risk-free rate. Because it appears in the denominator of TV = Year-5 UFCF × (1 + g) ÷ (WACC − g), even a small change can materially affect terminal value.</div>}
      {((perpetuity.valid && perpetuity.rawEquityValue < 0) || (multiple.valid && multiple.rawEquityValue < 0)) && <div className="negative-explainer"><b>WHY A METHOD CAN SHOW $0 FOR COMMON EQUITY</b><p>Under at least one valid terminal method, enterprise value plus cash does not cover funded debt. The mathematical bridge is negative, but common stock has limited liability, so the displayed value stops at $0 rather than showing a negative share price.</p></div>}
      <OutputScreen data={data} model={model} perpetuity={perpetuity} multiple={multiple} risks={risks} forecastConfidence={forecastConfidence} forecastConfidenceDetail={forecastConfidenceDetail} financialUnsupported={financialUnsupported}/>
    </section>}

    {!financialUnsupported && <details className="additional-information" onToggle={(event) => { if (!event.currentTarget.open) setActiveWorkspace(null); }}>
      <summary><strong>Additional information</strong><span>Calculations, assumptions, workbook and downloads</span></summary>
      <nav className="model-tools" aria-label="DCF tools">
      {([
        ["calculations", "Calculations"],
        ["assumptions", "Edit assumptions"],
        ["workbook", "DCF workbook"],
        ["presentation", "Presentation"],
      ] as const).map(([key, label]) => <button type="button" aria-pressed={activeWorkspace === key} className={activeWorkspace === key ? "active" : ""} key={key} onClick={() => setActiveWorkspace((current) => current === key ? null : key)}>{label}</button>)}
      <button type="button" className="excel-export compact" onClick={exportExcel} disabled={exportingExcel}>{exportingExcel ? "Building Excel…" : "Export Excel"}</button>
      {excelExportError && <small className="excel-export-error" role="alert">{excelExportError}</small>}
      </nav>
    </details>}

    {activeWorkspace === "calculations" && <section className="sheet-section" id="calculations"><div className="section-heading"><div><p>METHODS</p><h2>Valuation calculations</h2></div></div><div className="bridge-grid"><ValuationBridge title="Perpetual Growth Method" result={perpetuity} model={model} method="perpetuity" data={data}/><ValuationBridge title="Exit Multiple Method" result={multiple} model={model} method="multiple" data={data}/></div></section>}

    {activeWorkspace === "presentation" && <section className="research-workspace" aria-labelledby="research-workspace-title">
      <div className="research-workspace-heading"><div><h2 id="research-workspace-title">Company presentation</h2><p>Review the company, operating profile, valuation, peers, and risks as a seven-slide summary.</p></div></div>
      <div className="research-panel" aria-label="Pitch deck view">
        <PitchDeck data={data} businessDescription={briefDescription(data.company.description)} model={model} perpetuity={perpetuity} multiple={multiple} risks={risks} financialUnsupported={financialUnsupported}/>
      </div>
    </section>}

    {!financialUnsupported && activeWorkspace === "workbook" && <section className="sheet-section" id="build">
      <div className="section-heading"><div><span className="section-index">02</span><p>MODEL</p><h2>DCF workbook</h2></div><div className="unit-note">USD in millions · ticker-linked cells</div></div>
      <div className="method-audit">
        <div className="audit-heading"><div><span>CHECKING THE FORMULA</span><h3>Unlevered DCF</h3></div></div>
        <div className="six-step-grid">
          <article><span>01</span><b>Forecast UFCF</b><code>EBIT × (1−T) + D&amp;A − Capex − ΔNWC + deferred tax + other non-cash items</code></article>
          <article><span>02</span><b>Calculate terminal value</b><code>PG FCF: NOPAT₅ × (1−g/ROIC)<br/>PG TV: FCF₅ × (1+g) ÷ (WACC−g)<br/>Exit: EBITDA₅ × selected multiple</code></article>
          <article><span>03</span><b>Discount at WACC</b><code>EV = Σ[UFCFₜ ÷ (1+WACC)ᵗ] + TV ÷ (1+WACC)⁵</code></article>
          <article><span>04</span><b>Add non-operating assets</b><code>Enterprise value + cash &amp; included investments</code></article>
          <article><span>05</span><b>Subtract non-equity claims</b><code>− short debt − long debt − other non-equity claims</code></article>
          <article><span>06</span><b>Calculate value per share</b><code>Equity value ÷ fully diluted shares</code></article>
        </div>
        <p><b>Checking the model scope:</b> This is an automated DCF, not a fully linked three-statement model. A transaction-grade forecast should link EBIT, D&amp;A, capex, and working capital through the financial statements.</p>
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

    {!financialUnsupported && activeWorkspace === "assumptions" && <section className="sheet-section" id="assumptions">
      <div className="section-heading"><div><span className="section-index">01</span><p>INPUTS</p><h2>Forecast assumptions</h2></div><div className="unit-note">Revenue, margin, tax, D&amp;A, capex and working-capital drivers</div></div>
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
      <div className="assumption-bottom"><div className="wacc-table"><div className="sheet-bar">Checking the <DefinedTerm term="wacc">WACC</DefinedTerm> formula</div><div><span><DefinedTerm term="riskFreeRate">Risk-free rate</DefinedTerm></span><b>{pct2.format(riskFree)}%</b></div><div><span><DefinedTerm term="beta">Beta</DefinedTerm></span><b>{pct2.format(beta)}×</b></div><div><span><DefinedTerm term="equityRiskPremium">Equity risk premium</DefinedTerm></span><b>{pct2.format(equityRiskPremium)}%</b></div><div><span><DefinedTerm term="costOfEquity">Cost of equity</DefinedTerm> = Rf + β × ERP</span><b>{pct2.format(costEquity)}%</b></div><div><span><DefinedTerm term="equityWeight">Equity / capital</DefinedTerm></span><b>{pct2.format(equityWeight * 100)}%</b></div><div><span>Equity contribution = cost × weight</span><b>{pct2.format(equityContribution)}%</b></div><div><span><DefinedTerm term="preTaxCostOfDebt">Pre-tax cost of debt</DefinedTerm></span><b>{pct2.format(preTaxDebt)}%</b></div><div><span>After-tax debt cost</span><b>{pct2.format(afterTaxDebt)}%</b></div><div><span><DefinedTerm term="debtWeight">Debt / capital</DefinedTerm></span><b>{pct2.format(debtWeight * 100)}%</b></div><div><span>Debt contribution = cost × weight</span><b>{pct2.format(debtContribution)}%</b></div><div><span>Base formula WACC</span><b>{pct2.format(referenceWacc)}%</b></div><div><span><DefinedTerm term="companySpecificPremium">Company-specific premium</DefinedTerm></span><b>{pct2.format(model.companyRiskPremium)}%</b></div><div className="total"><span>Selected <DefinedTerm term="wacc">WACC</DefinedTerm></span><b>{pct2.format(selectedWacc)}%</b></div><small>Base WACC equals the equity contribution plus the debt contribution. The selected WACC then adds the visible optional premium. Open the WACC workbook tab to see every formula with the actual numbers used.</small></div>
        <div className="data-check"><div className="sheet-bar">Checking the data</div><ul>{(data.qualityNotes?.length ? data.qualityNotes : ["Sample data is active. Enter a ticker to load current public-company data."]).map((note) => <li key={note}>{note}</li>)}</ul></div>
      </div>
    </section>}

    <footer><span>Educational decision support only—not personalized investment advice.</span><span>MODEL V2 · DATA MAY BE DELAYED</span></footer>
    </div>}
  </main>;
}
