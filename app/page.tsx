"use client";

import { FormEvent, useMemo, useState } from "react";

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
};
type Comparable = {
  symbol: string;
  name: string;
  marketCap: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  evToRevenue: number | null;
  evToEbitda: number | null;
  pe: number | null;
};
type CompanyData = {
  source: string;
  asOf: string;
  qualityNotes?: string[];
  company: { symbol: string; name: string; description: string; exchange: string; currency: string; country: string; sector: string; industry: string };
  market: { marketCap: number; shares: number; estimatedPrice: number; beta: number; priceHistory?: PricePoint[] };
  metrics: { revenueGrowth: number; revenue: number; ebitMargin: number; capexPercentRevenue: number; daPercentRevenue: number; cash: number; debt: number; taxRate: number };
  comparison?: { company: Comparable; peers: Comparable[]; selectedPeerSymbols: string[]; industryGrowthRate: number | null };
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
  debt: number;
  shares: number;
  marketPrice: number;
};
type Method = "perpetuity" | "multiple";

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
  market: { marketCap: 12500, shares: 250, estimatedPrice: 50, beta: 1.15, priceHistory: demoPrices },
  metrics: { revenueGrowth: 12, revenue: 2400, ebitMargin: 24, capexPercentRevenue: 4, daPercentRevenue: 3, cash: 650, debt: 320, taxRate: 21 },
  comparison: {
    company: { symbol: "DEMO", name: "Northstar Systems", marketCap: 12500, revenueGrowth: 12, operatingMargin: 24, evToRevenue: 4.8, evToEbitda: 17.6, pe: 28.4 },
    peers: [
      { symbol: "ATLS", name: "Atlas Cloud", marketCap: 18400, revenueGrowth: 15.5, operatingMargin: 21.2, evToRevenue: 5.6, evToEbitda: 20.4, pe: 31.8 },
      { symbol: "MRDN", name: "Meridian Software", marketCap: 9700, revenueGrowth: 9.3, operatingMargin: 26.8, evToRevenue: 4.1, evToEbitda: 15.2, pe: 24.9 },
      { symbol: "VCTR", name: "Vector Systems", marketCap: 15100, revenueGrowth: 11.1, operatingMargin: 22.5, evToRevenue: 4.7, evToEbitda: 18.1, pe: 27.5 },
    ],
    selectedPeerSymbols: ["ATLS", "MRDN", "VCTR"],
    industryGrowthRate: 11.1,
  },
  historical: [
    { year: "2021", revenue: 1450, ebit: 247, ebitMargin: 17, operatingCashFlow: 242, capex: 62, capexPercentRevenue: 4.3, depreciation: 44, freeCashFlow: 180 },
    { year: "2022", revenue: 1650, ebit: 314, ebitMargin: 19, operatingCashFlow: 300, capex: 70, capexPercentRevenue: 4.2, depreciation: 50, freeCashFlow: 230 },
    { year: "2023", revenue: 1880, ebit: 376, ebitMargin: 20, operatingCashFlow: 360, capex: 78, capexPercentRevenue: 4.1, depreciation: 56, freeCashFlow: 282 },
    { year: "2024", revenue: 2150, ebit: 473, ebitMargin: 22, operatingCashFlow: 436, capex: 86, capexPercentRevenue: 4, depreciation: 65, freeCashFlow: 350 },
    { year: "2025", revenue: 2400, ebit: 576, ebitMargin: 24, operatingCashFlow: 506, capex: 96, capexPercentRevenue: 4, depreciation: 72, freeCashFlow: 410 },
  ],
};

const industryRules = [
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
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validMedian = (values: Array<number | null>) => {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const peerMedian = (data: CompanyData, key: keyof Pick<Comparable, "marketCap" | "revenueGrowth" | "operatingMargin" | "evToRevenue" | "evToEbitda" | "pe">) => validMedian((data.comparison?.peers || []).map((peer) => peer[key]));

function recommendations(data: CompanyData) {
  const text = `${data.company.sector} ${data.company.industry}`;
  const rule = industryRules.find((item) => item.match.test(text)) || { multiple: 10, wacc: 9.5, terminal: 2.5, margin: 15, note: "Use a conservative starting point and compare every assumption with direct industry peers." };
  const historicalGrowth = data.metrics.revenueGrowth;
  const growth = historicalGrowth > 100 ? 40 : historicalGrowth > 50 ? 30 : historicalGrowth > 25 ? 20 : clamp(historicalGrowth * .65, 2, 18);
  const margin = data.metrics.ebitMargin < 3 ? rule.margin : clamp(data.metrics.ebitMargin, 3, 40);
  const da = clamp(data.metrics.daPercentRevenue || data.metrics.capexPercentRevenue * .75, 1, 50);
  const capex = data.metrics.capexPercentRevenue > 50 ? clamp(da * 1.05, 20, 50) : clamp(data.metrics.capexPercentRevenue, 1, 30);
  const riskPremium = (historicalGrowth > 50 ? 1.5 : 0) + (data.metrics.debt > data.metrics.revenue * 2 ? 1.5 : 0);
  return { ...rule, growth: Math.round(growth * 10) / 10, margin: Math.round(margin * 10) / 10, da: Math.round(da * 10) / 10, capex: Math.round(capex * 10) / 10, wacc: Math.min(13, rule.wacc + riskPremium) };
}

function buildModel(data: CompanyData): Model {
  const rec = recommendations(data);
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
    debt: data.metrics.debt,
    shares: data.market.shares || 1,
    marketPrice: Math.round(data.market.estimatedPrice * 100) / 100,
  };
}

function calculate(
  data: CompanyData,
  model: Model,
  method: Method,
  growthShift = 0,
  marginShift = 0,
  overrides: { wacc?: number; terminalGrowth?: number; exitMultiple?: number } = {},
) {
  let revenue = data.metrics.revenue;
  let previousRevenue = revenue;
  const waccPercent = overrides.wacc ?? model.wacc;
  const terminalGrowth = overrides.terminalGrowth ?? model.terminalGrowth;
  const exitMultiple = overrides.exitMultiple ?? model.exitMultiple;
  const wacc = waccPercent / 100;
  const years = Array.from({ length: 5 }, (_, index) => {
    const year = index + 1;
    const fade = 1 - index * .2;
    const startingGrowth = Math.max(terminalGrowth, model.growth + growthShift);
    const growth = (terminalGrowth + (startingGrowth - terminalGrowth) * fade) / 100;
    revenue *= 1 + growth;
    const targetMargin = model.margin + marginShift;
    const forecastMargin = data.metrics.ebitMargin + (targetMargin - data.metrics.ebitMargin) * (year / 5);
    const ebit = revenue * forecastMargin / 100;
    const tax = Math.max(0, ebit * model.tax / 100);
    const nopat = ebit - tax;
    const depreciation = revenue * model.da / 100;
    const capex = revenue * model.capex / 100;
    const changeNwc = Math.max(0, revenue - previousRevenue) * model.nwc / 100;
    const fcf = nopat + depreciation - capex - changeNwc;
    const discountFactor = 1 / Math.pow(1 + wacc, year);
    previousRevenue = revenue;
    return { year, growth: growth * 100, margin: forecastMargin, revenue, ebit, tax, nopat, depreciation, capex, changeNwc, fcf, discountFactor, pv: fcf * discountFactor };
  });
  const last = years[4];
  const terminalValue = method === "perpetuity"
    ? waccPercent > terminalGrowth ? last.fcf * (1 + terminalGrowth / 100) / (wacc - terminalGrowth / 100) : 0
    : (last.ebit + last.depreciation) * exitMultiple;
  const pvTerminal = terminalValue * last.discountFactor;
  const pvForecast = years.reduce((sum, year) => sum + year.pv, 0);
  const enterpriseValue = pvForecast + pvTerminal;
  const rawEquityValue = enterpriseValue + model.cash - model.debt;
  const equityValue = Math.max(0, rawEquityValue);
  const perShare = equityValue / Math.max(model.shares, 1);
  return { years, terminalValue, pvTerminal, pvForecast, enterpriseValue, rawEquityValue, equityValue, perShare, terminalShare: enterpriseValue ? pvTerminal / enterpriseValue * 100 : 0 };
}

function moveFromPrice(value: number, price: number) {
  const change = price ? (value / price - 1) * 100 : 0;
  return { change, label: change >= 0 ? "Upside" : "Downside" };
}

function riskAnalysis(data: CompanyData, model: Model, result: ReturnType<typeof calculate>) {
  const risks: Array<{ level: "high" | "medium" | "low"; title: string; detail: string }> = [];
  const capex = data.metrics.capexPercentRevenue;
  risks.push({ level: capex > 12 ? "high" : capex > 6 ? "medium" : "low", title: "Capital intensity", detail: `${fmt.format(capex)}% of latest revenue was spent on capex. High reinvestment can prevent accounting profit from becoming distributable cash.` });
  const leverage = data.metrics.debt / Math.max(data.metrics.revenue, 1);
  risks.push({ level: leverage > 1 ? "high" : leverage > .45 ? "medium" : "low", title: "Balance-sheet leverage", detail: `Debt equals ${fmt.format(leverage * 100)}% of annual revenue. Refinancing risk rises if rates increase or earnings deteriorate.` });
  risks.push({ level: result.terminalShare > 80 ? "high" : result.terminalShare > 65 ? "medium" : "low", title: "Terminal-value dependence", detail: `${fmt.format(result.terminalShare)}% of enterprise value comes from cash flows beyond Year 5.` });
  const country = data.company.country || "Unknown";
  const geoHigh = /china|russia|taiwan|ukraine|israel/i.test(country);
  const geoMedium = /semiconductor|aerospace|defense|energy|mining|shipping|telecom/i.test(`${data.company.industry} ${data.company.sector}`);
  risks.push({ level: geoHigh ? "high" : geoMedium ? "medium" : "low", title: "Geopolitical exposure", detail: `${country} domicile and ${data.company.industry} exposure can create trade, sanctions, supply-chain, currency, or regulatory risk. This is a screen, not geographic revenue analysis.` });
  const margins = data.historical.map((row) => row.ebitMargin).filter(Number.isFinite);
  const spread = margins.length ? Math.max(...margins) - Math.min(...margins) : 0;
  risks.push({ level: spread > 15 ? "high" : spread > 7 ? "medium" : "low", title: "Margin stability", detail: `Historical EBIT margin range is ${fmt.format(spread)} percentage points. Wide swings reduce forecast reliability.` });
  const valuation = moveFromPrice(result.perShare, model.marketPrice);
  risks.push({ level: valuation.change < 10 ? "high" : valuation.change < 25 ? "medium" : "low", title: "Valuation cushion", detail: `The selected DCF method implies ${fmt.format(Math.abs(valuation.change))}% ${valuation.label.toLowerCase()}. A small cushion leaves little room for forecasting error.` });
  return risks;
}

function NumberField({ label, value, suffix, help, onChange }: { label: string; value: number; suffix: string; help: string; onChange: (value: number) => void }) {
  const [showHelp, setShowHelp] = useState(false);
  return <div className="number-field">
    <div className="field-label"><span>{label}</span><button type="button" aria-label={`Explain ${label}`} aria-expanded={showHelp} onClick={() => setShowHelp((open) => !open)}>?</button></div>
    <div className="input-cell"><input aria-label={`${label} ${suffix}`} type="number" step="0.1" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} /><b>{suffix}</b></div>
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
  const yearFive = result.years[4];
  return <div className="bridge-table">
    <div className="sheet-bar">{title}</div>
    {method === "perpetuity" ? <>
      <div className="reference-row"><span>Observed peer industry growth</span><b>{industryGrowth === null ? "—" : `${fmt.format(industryGrowth)}%`}</b></div>
      <div><span>Selected perpetual growth</span><b>{fmt.format(model.terminalGrowth)}%</b></div>
      <div><span>Year 5 UFCF</span><b>{usd0.format(yearFive.fcf)}M</b></div>
      <p className="bridge-note">Peer growth is median recent year-over-year revenue growth. It provides industry context, but the perpetual rate is a separate long-run assumption and must remain below WACC.</p>
    </> : <>
      <div><span>Year 5 EBITDA</span><b>{usd0.format(yearFive.ebit + yearFive.depreciation)}M</b></div>
      <div><span>Selected exit multiple</span><b>{fmt.format(model.exitMultiple)}×</b></div>
      <div className="reference-row"><span>Peer median EV / EBITDA</span><b>{medianMultiple === null ? "—" : `${fmt.format(medianMultiple)}×`}</b></div>
      <div><span>Peer EV / EBITDA range</span><b>{peerMultiples.length ? `${fmt.format(Math.min(...peerMultiples))}–${fmt.format(Math.max(...peerMultiples))}×` : "—"}</b></div>
      <p className="bridge-note">The selected exit multiple stays editable. Compare it with the peer range and explain any premium or discount.</p>
    </>}
    <div><span>PV of forecast UFCF</span><b>{usd0.format(result.pvForecast)}M</b></div>
    <div><span>PV of terminal value</span><b>{usd0.format(result.pvTerminal)}M</b></div>
    <div className="total"><span>Enterprise value</span><b>{usd0.format(result.enterpriseValue)}M</b></div>
    <div><span>Plus: Cash</span><b>{usd0.format(model.cash)}M</b></div>
    <div><span>Less: Debt</span><b>({usd0.format(model.debt)}M)</b></div>
    <div className="total"><span>Equity value</span><b>{usd0.format(result.equityValue)}M</b></div>
    <div><span>Diluted shares</span><b>{fmt.format(model.shares)}M</b></div>
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
    <div className="table-scroll"><table className="sensitivity-table"><thead><tr><th>WACC ↓</th>{columns.map((value) => <th key={value}>{fmt.format(value)}{method === "perpetuity" ? "%" : "×"}</th>)}</tr></thead><tbody>
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
  const [period, setPeriod] = useState<"1Y" | "3Y" | "5Y" | "MAX">("5Y");
  const filtered = useMemo(() => {
    if (!points.length || period === "MAX") return points;
    const latest = new Date(points[points.length - 1].date);
    const years = period === "1Y" ? 1 : period === "3Y" ? 3 : 5;
    const cutoff = new Date(latest);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
    return points.filter((point) => new Date(point.date) >= cutoff);
  }, [period, points]);

  if (filtered.length < 2) return <div className="chart-empty">Price history was not returned by the data provider for this ticker.</div>;
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
  const dateLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(date));
  return <div className="price-chart-card">
    <div className="chart-head"><div><span>{symbol} MONTHLY CLOSE</span><h3>{usd.format(last.close)} <i className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{fmt.format(change)}%</i></h3></div><div className="period-toggle">{(["1Y", "3Y", "5Y", "MAX"] as const).map((item) => <button type="button" className={item === period ? "active" : ""} key={item} onClick={() => setPeriod(item)}>{item}</button>)}</div></div>
    <svg className="price-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${symbol} monthly closing price chart for ${period}`}>
      <defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#18b9c8" stopOpacity=".28"/><stop offset="1" stopColor="#18b9c8" stopOpacity="0"/></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((ratio) => { const value = max - (max - min) * ratio; const yPos = y(value); return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={yPos} y2={yPos}/><text x={pad.left - 10} y={yPos + 4} textAnchor="end">{usd0.format(value)}</text></g>; })}
      {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 17} textAnchor={index === 0 ? "start" : index === filtered.length - 1 ? "end" : "middle"}>{dateLabel(filtered[index].date)}</text>)}
      <path className="price-area" d={area}/><path className="price-line" d={line}/>
      <circle cx={x(filtered.length - 1)} cy={y(last.close)} r="4"/>
    </svg>
    <div className="chart-stats"><span>Period low <b>{usd.format(rawMin)}</b></span><span>Period high <b>{usd.format(rawMax)}</b></span><span>Observations <b>{filtered.length} months</b></span></div>
  </div>;
}

function CompetitorComparison({ data }: { data: CompanyData }) {
  const comparison = data.comparison;
  const company: Comparable = comparison?.company || {
    symbol: data.company.symbol,
    name: data.company.name,
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
  const rows = peers.length ? [company, ...peers] : [company];
  return <section className="sheet-section" id="competitors">
    <div className="section-heading"><div><span className="section-index">05</span><p>RELATIVE VALUATION</p><h2>Competitor companies</h2></div><p className="section-description">Peers are selected automatically from the reported industry. Review the group before relying on its growth rates or trading multiples.</p></div>
    <div className="peer-summary"><div><span>INDUSTRY GROWTH BENCHMARK</span><strong>{comparison?.industryGrowthRate === null || comparison?.industryGrowthRate === undefined ? "—" : `${fmt.format(comparison.industryGrowthRate)}%`}</strong><small>Median recent peer revenue growth</small></div><div><span>PEER MEDIAN EV / EBITDA</span><strong>{metrics.multiple === null ? "—" : `${fmt.format(metrics.multiple)}×`}</strong><small>Reference for the exit-multiple method</small></div><div><span>AUTOMATIC PEER GROUP</span><strong>{(comparison?.selectedPeerSymbols || peers.map((peer) => peer.symbol)).join(" · ") || "Unavailable"}</strong><small>Verify business-model and geographic comparability</small></div></div>
    <div className="peer-table-wrap table-scroll"><table className="peer-table"><thead><tr><th>Company</th><th>Market cap</th><th>Revenue growth</th><th>Operating margin</th><th>EV / Revenue</th><th>EV / EBITDA</th><th>P / E</th></tr></thead><tbody>
      {rows.map((peer, index) => <tr className={index === 0 ? "focus-company" : ""} key={peer.symbol}><td><b>{peer.symbol}</b><span>{peer.name}</span>{index === 0 && <em>FOCUS COMPANY</em>}</td><td>{formatCap(peer.marketCap)}</td><td>{formatMetric(peer.revenueGrowth, "%")}</td><td>{formatMetric(peer.operatingMargin, "%")}</td><td>{formatMetric(peer.evToRevenue)}</td><td>{formatMetric(peer.evToEbitda)}</td><td>{formatMetric(peer.pe)}</td></tr>)}
      {peers.length > 0 && <tr className="peer-median"><td><b>PEER MEDIAN</b><span>{peers.length} returned companies</span></td><td>{formatCap(metrics.marketCap)}</td><td>{formatMetric(metrics.growth, "%")}</td><td>{formatMetric(metrics.margin, "%")}</td><td>{formatMetric(metrics.revenueMultiple)}</td><td>{formatMetric(metrics.multiple)}</td><td>{formatMetric(metrics.pe)}</td></tr>}
    </tbody></table></div>
    {!peers.length && <div className="peer-empty">Comparable ratios were not returned—usually because the free provider allowance ended after the main DCF loaded. The valuation still works, but peer benchmarks are unavailable for this request.</div>}
    <h3 className="difference-title">How {company.symbol} differs from the peer median</h3>
    <div className="difference-grid">{insights.map((insight) => <article key={insight.label}><span>{insight.label}</span><strong>{insight.value}</strong><p>{insight.detail}</p></article>)}</div>
    <p className="peer-disclaimer">Revenue growth uses the provider’s latest quarterly year-over-year field. Multiples and margins are trailing metrics and may not be comparable when earnings are negative, fiscal periods differ, or business mixes vary.</p>
  </section>;
}

function LearningWalkthrough({ data, model, result, method }: { data: CompanyData; model: Model; result: ReturnType<typeof calculate>; method: Method }) {
  const [step, setStep] = useState(0);
  const first = result.years[0];
  const last = result.years[4];
  const steps = [
    { title: "Start with the business", concept: "A DCF estimates what a company is worth today by forecasting the cash its operations can generate.", formula: "Value today = PV of forecast cash flow + PV of terminal value", example: `${data.company.name} begins with ${usd0.format(data.metrics.revenue)}M of latest annual revenue.`, question: "Do you understand how the company makes money and what could permanently impair it?" },
    { title: "Forecast revenue", concept: "Revenue is the top line. Growth normally slows as a company becomes larger, so the model fades the starting rate.", formula: "Revenue₁ = Revenue₀ × (1 + growth)", example: `${usd0.format(data.metrics.revenue)}M × (1 + ${fmt.format(first.growth)}%) = ${usd0.format(first.revenue)}M.`, question: `Is ${fmt.format(model.growth)}% consistent with industry demand and competition?` },
    { title: "Estimate operating profit", concept: "EBIT measures operating profit before interest and tax. The forecast gradually moves from the latest margin to your target.", formula: "EBIT = Revenue × EBIT margin", example: `${usd0.format(first.revenue)}M × ${fmt.format(first.margin)}% = ${usd0.format(first.ebit)}M.`, question: "What evidence supports the target margin?" },
    { title: "Calculate NOPAT", concept: "NOPAT keeps operations separate from financing by applying a normalized tax rate to EBIT.", formula: "NOPAT = EBIT − cash taxes", example: `${usd0.format(first.ebit)}M − ${usd0.format(first.tax)}M = ${usd0.format(first.nopat)}M.`, question: "Are recent tax benefits or charges temporary?" },
    { title: "Account for reinvestment", concept: "Add back non-cash D&A, then subtract capex and working capital required to support growth.", formula: "UFCF = NOPAT + D&A − Capex − ΔNWC", example: `${usd0.format(first.nopat)}M + ${usd0.format(first.depreciation)}M − ${usd0.format(first.capex)}M − ${usd0.format(first.changeNwc)}M = ${usd0.format(first.fcf)}M.`, question: "Does this growth require more physical investment than the model assumes?" },
    { title: "Discount the cash flow", concept: "Future cash is worth less than cash today. WACC represents the return required by debt and equity investors.", formula: "PV = Future UFCF ÷ (1 + WACC)ⁿ", example: `Year 5 UFCF of ${usd0.format(last.fcf)}M × ${last.discountFactor.toFixed(3)} = ${usd0.format(last.pv)}M.`, question: `Does ${fmt.format(model.wacc)}% capture the company’s risk?` },
    { title: "Estimate terminal value", concept: method === "perpetuity" ? "Gordon Growth assumes cash flow grows forever at a stable rate." : "Exit Multiple assumes the business is valued at a selected EBITDA multiple in Year 5.", formula: method === "perpetuity" ? "TV = UFCF₅ × (1 + g) ÷ (WACC − g)" : "TV = EBITDA₅ × exit multiple", example: `${usd0.format(result.terminalValue)}M before discounting.`, question: `Terminal value is ${fmt.format(result.terminalShare)}% of enterprise value. Is that dependence acceptable?` },
    { title: "Bridge to equity value", concept: "Enterprise value belongs to all capital providers. Add available cash and subtract funded debt to reach common equity.", formula: "Equity value = Enterprise value + Cash − Debt", example: `${usd0.format(result.enterpriseValue)}M + ${usd0.format(model.cash)}M − ${usd0.format(model.debt)}M = ${usd0.format(result.rawEquityValue)}M before the $0 floor.`, question: "Are there leases, pensions, minority interests, or other claims to include?" },
    { title: "Calculate value per share", concept: "Divide equity value by diluted shares. The difference from market price is a scenario result, not proof.", formula: "Value per share = Equity value ÷ diluted shares", example: `${usd0.format(result.equityValue)}M ÷ ${fmt.format(model.shares)}M = ${usd.format(result.perShare)}.`, question: "Is the upside large enough to absorb forecasting mistakes?" },
  ];
  const active = steps[step];
  return <section className="learning-section sheet-section" id="learn">
    <div className="section-heading"><div><span className="section-index">07</span><p>GUIDED LEARNING</p><h2>Learn the model one row at a time</h2></div><div className="lesson-count"><strong>{String(step + 1).padStart(2, "0")}</strong><span>OF {String(steps.length).padStart(2, "0")}</span></div></div>
    <div className="lesson-progress" aria-label="DCF learning steps">{steps.map((item, index) => <button type="button" key={item.title} className={index === step ? "active" : index < step ? "complete" : ""} aria-label={`Step ${index + 1}: ${item.title}`} onClick={() => setStep(index)}><span>{index + 1}</span></button>)}</div>
    <div className="lesson-card"><div className="lesson-main"><span>STEP {step + 1}</span><h3>{active.title}</h3><p>{active.concept}</p><div className="formula"><b>FORMULA</b><code>{active.formula}</code></div></div><div className="lesson-side"><div><span>WITH THIS COMPANY</span><p>{active.example}</p></div><div><span>QUESTION TO ASK</span><p>{active.question}</p></div></div></div>
    <div className="lesson-controls"><button type="button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>← Previous</button><span>{active.title}</span><button type="button" disabled={step === steps.length - 1} onClick={() => setStep((current) => current + 1)}>Next →</button></div>
  </section>;
}

export default function Home() {
  const [ticker, setTicker] = useState("IBM");
  const [data, setData] = useState<CompanyData>(demo);
  const [model, setModel] = useState<Model>(() => buildModel(demo));
  const [method, setMethod] = useState<Method>("perpetuity");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rec = useMemo(() => recommendations(data), [data]);
  const perpetuity = useMemo(() => calculate(data, model, "perpetuity"), [data, model]);
  const multiple = useMemo(() => calculate(data, model, "multiple"), [data, model]);
  const result = method === "perpetuity" ? perpetuity : multiple;
  const risks = useMemo(() => riskAnalysis(data, model, result), [data, model, result]);
  const latest = data.historical[data.historical.length - 1];
  const update = (key: keyof Model, value: number) => setModel((current) => ({ ...current, [key]: value }));

  async function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/company?symbol=${encodeURIComponent(ticker.trim().toUpperCase())}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to load company.");
      setData(json);
      setModel(buildModel(json));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load company.");
    } finally {
      setLoading(false);
    }
  }

  const tableRows: Array<{ label: string; actual: number | null; values: Array<number | null>; type?: "percent" | "factor" | "total" | "negative" }> = [
    { label: "Revenue", actual: data.metrics.revenue, values: result.years.map((year) => year.revenue) },
    { label: "% Growth", actual: data.metrics.revenueGrowth, values: result.years.map((year) => year.growth), type: "percent" },
    { label: "EBIT", actual: latest?.ebit ?? data.metrics.revenue * data.metrics.ebitMargin / 100, values: result.years.map((year) => year.ebit) },
    { label: "% Margin", actual: data.metrics.ebitMargin, values: result.years.map((year) => year.margin), type: "percent" },
    { label: "Less: Cash taxes", actual: null, values: result.years.map((year) => year.tax), type: "negative" },
    { label: "NOPAT", actual: null, values: result.years.map((year) => year.nopat), type: "total" },
    { label: "Plus: D&A", actual: latest?.depreciation ?? data.metrics.revenue * data.metrics.daPercentRevenue / 100, values: result.years.map((year) => year.depreciation) },
    { label: "Less: Capex", actual: latest?.capex ?? data.metrics.revenue * data.metrics.capexPercentRevenue / 100, values: result.years.map((year) => year.capex), type: "negative" },
    { label: "Less: Increase in NWC", actual: null, values: result.years.map((year) => year.changeNwc), type: "negative" },
    { label: "Unlevered Free Cash Flow", actual: latest?.freeCashFlow ?? null, values: result.years.map((year) => year.fcf), type: "total" },
    { label: "Discount period", actual: null, values: result.years.map((year) => year.year), type: "factor" },
    { label: "Discount factor", actual: null, values: result.years.map((year) => year.discountFactor), type: "factor" },
    { label: "PV of UFCF", actual: null, values: result.years.map((year) => year.pv), type: "total" },
    { label: "Terminal value", actual: null, values: [null, null, null, null, null], type: "total" },
    { label: "PV of terminal value", actual: null, values: [null, null, null, null, null], type: "total" },
  ];
  const formatCell = (value: number | null, type?: string) => {
    if (value === null || !Number.isFinite(value)) return "—";
    if (type === "percent") return `${fmt.format(value)}%`;
    if (type === "factor") return value < 1 ? value.toFixed(3) : fmt.format(value);
    if (type === "negative") return `(${fmt.format(Math.abs(value))})`;
    return fmt.format(value);
  };

  const marketCapitalization = model.marketPrice * model.shares;
  const capital = Math.max(1, marketCapitalization + model.debt);
  const equityWeight = marketCapitalization / capital;
  const debtWeight = model.debt / capital;
  const beta = data.market.beta || 1;
  const riskFree = 4.5;
  const equityRiskPremium = 5;
  const costEquity = riskFree + beta * equityRiskPremium;
  const preTaxDebt = 6;
  const referenceWacc = costEquity * equityWeight + preTaxDebt * (1 - model.tax / 100) * debtWeight;

  return <main>
    <nav className="top-nav"><a href="#top" className="brand">DCF CALCULATOR</a><span>Interactive valuation workbook</span></nav>
    <header id="top" className="calculator-header">
      <p>DISCOUNTED CASH FLOW</p>
      <h1>DCF Calculator</h1>
      <div className="instructions"><b>Instructions</b><span>Enter a public-company ticker below. The calculator loads annual financials, builds a five-year forecast, and keeps every assumption editable.</span></div>
      <form className="ticker-search" onSubmit={search}><label><span>TICKER SYMBOL</span><input aria-label="Ticker symbol" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="AAPL" /></label><button disabled={loading}>{loading ? "BUILDING DCF…" : "BUILD DCF →"}</button></form>
      {error && <div className="api-error"><b>Data connection:</b> {error}</div>}
      <small>Powered by Alpha Vantage. A complete ticker analysis uses up to eight API calls, including price history and three peer-company overviews.</small>
    </header>

    <section className="company-summary">
      <div><span>{data.company.exchange} · {data.company.symbol}</span><h2>{data.company.name}</h2><p>{data.company.description}</p></div>
      <dl><div><dt>Reference price</dt><dd>{usd.format(model.marketPrice)}</dd></div><div><dt>Industry</dt><dd>{data.company.industry}</dd></div><div><dt>Financials through</dt><dd>{data.asOf}</dd></div><div><dt>Data source</dt><dd>{data.source}</dd></div></dl>
    </section>

    <nav className="sheet-tabs" aria-label="DCF workbook sections">
      <a href="#valuation">Valuation</a><a href="#build">DCF Build</a><a href="#assumptions">Assumptions</a><a href="#price-history">Price History</a><a href="#competitors">Competitors</a><a href="#risks">Potential Risks</a><a href="#learn">Learn DCF</a>
    </nav>

    <section className="sheet-section" id="valuation">
      <div className="section-heading"><div><span className="section-index">01</span><p>OUTPUT</p><h2>DCF valuation</h2></div><div className="method-selector"><span>PRIMARY METHOD</span><button className={method === "perpetuity" ? "active" : ""} onClick={() => setMethod("perpetuity")}>Perpetual growth</button><button className={method === "multiple" ? "active" : ""} onClick={() => setMethod("multiple")}>Exit multiple</button></div></div>
      <div className="valuation-cards"><div><span>Current share price</span><strong>{usd.format(model.marketPrice)}</strong><small>Reference only</small></div><button className={method === "perpetuity" ? "selected" : ""} onClick={() => setMethod("perpetuity")}><span>Perpetual growth value</span><strong>{usd.format(perpetuity.perShare)}</strong><ValueMove value={perpetuity.perShare} price={model.marketPrice}/></button><button className={method === "multiple" ? "selected" : ""} onClick={() => setMethod("multiple")}><span>Exit multiple value</span><strong>{usd.format(multiple.perShare)}</strong><ValueMove value={multiple.perShare} price={model.marketPrice}/></button></div>
      {model.wacc <= model.terminalGrowth && <div className="api-error valuation-warning"><b>Assumption error:</b> WACC must be greater than terminal growth for the perpetual-growth method.</div>}
      {result.rawEquityValue < 0 && <div className="negative-explainer"><b>WHY COMMON EQUITY IS $0</b><p>Enterprise value plus cash is {usd0.format(Math.abs(result.rawEquityValue))}M short of funded debt under the selected assumptions. The mathematical bridge is negative, but common stock has limited liability, so the displayed value stops at $0 rather than showing a negative share price.</p></div>}
      <div className="bridge-grid"><ValuationBridge title="Perpetual Growth Method" result={perpetuity} model={model} method="perpetuity" data={data}/><ValuationBridge title="Exit Multiple Method" result={multiple} model={model} method="multiple" data={data}/></div>
      <div className="sensitivity-grid"><SensitivityTable data={data} model={model} method="perpetuity"/><SensitivityTable data={data} model={model} method="multiple"/></div>
    </section>

    <section className="sheet-section" id="build">
      <div className="section-heading"><div><span className="section-index">02</span><p>MODEL</p><h2>DCF build</h2></div><div className="unit-note">USD IN MILLIONS · BLUE = FORECAST</div></div>
      <div className="model-table-wrap"><table className="model-table"><thead><tr><th>DCF line item</th><th className="actual">{latest?.year || "Latest"}A</th>{result.years.map((year) => <th key={year.year}>YEAR {year.year}E</th>)}<th>Terminal</th></tr></thead><tbody>
        {tableRows.map((row) => <tr className={`${row.type === "total" ? "total" : ""} ${row.type === "percent" ? "percent-row" : ""}`} key={row.label}><td>{row.label}</td><td className="actual">{formatCell(row.actual, row.type)}</td>{row.values.map((value, index) => <td key={index}>{formatCell(value, row.type)}</td>)}<td>{row.label === "Unlevered Free Cash Flow" ? fmt.format(result.years[4].fcf) : row.label === "Terminal value" ? fmt.format(result.terminalValue) : row.label === "PV of terminal value" ? fmt.format(result.pvTerminal) : "—"}</td></tr>)}
      </tbody></table></div>
      <p className="table-footnote">Latest historical FCF is operating cash flow less capex. Forecast UFCF is calculated from NOPAT + D&A − capex − change in working capital.</p>
    </section>

    <section className="sheet-section" id="assumptions">
      <div className="section-heading"><div><span className="section-index">03</span><p>INPUTS</p><h2>Editable assumptions</h2></div><div className="unit-note">BLUE CELLS ARE EDITABLE</div></div>
      <div className="recommendation"><b>{data.company.industry} starting point</b><p>{rec.note}</p><span>{data.comparison?.industryGrowthRate === null || data.comparison?.industryGrowthRate === undefined ? "Peer industry growth was unavailable. " : `Observed peer industry revenue growth: ${fmt.format(data.comparison.industryGrowthRate)}%. `}This near-term benchmark is separate from the editable long-run terminal growth rate.</span></div>
      <div className="assumption-grid">
        <NumberField label="Starting revenue growth" value={model.growth} suffix="%" help="Year 1 sales growth. The model fades it toward terminal growth over five years." onChange={(value) => update("growth", value)}/>
        <NumberField label="Target EBIT margin" value={model.margin} suffix="%" help="Year 5 operating margin before interest and tax." onChange={(value) => update("margin", value)}/>
        <NumberField label="Tax rate" value={model.tax} suffix="%" help="Normalized cash tax rate applied to positive EBIT." onChange={(value) => update("tax", value)}/>
        <NumberField label="D&A / revenue" value={model.da} suffix="%" help="Non-cash depreciation and amortization added back to NOPAT." onChange={(value) => update("da", value)}/>
        <NumberField label="Capex / revenue" value={model.capex} suffix="%" help="Cash investment in long-lived operating assets." onChange={(value) => update("capex", value)}/>
        <NumberField label="NWC / new revenue" value={model.nwc} suffix="%" help="Working capital absorbed by each dollar of incremental revenue." onChange={(value) => update("nwc", value)}/>
        <NumberField label="WACC" value={model.wacc} suffix="%" help="Required return for debt and equity capital. It discounts forecast cash flows." onChange={(value) => update("wacc", value)}/>
        <NumberField label="Terminal growth" value={model.terminalGrowth} suffix="%" help="Long-run growth after Year 5. It must remain below WACC." onChange={(value) => update("terminalGrowth", value)}/>
        <NumberField label="Exit EBITDA multiple" value={model.exitMultiple} suffix="×" help="Year 5 EBITDA valuation multiple used in the exit-multiple method." onChange={(value) => update("exitMultiple", value)}/>
        <NumberField label="Reference market price" value={model.marketPrice} suffix="$" help="Market price used to calculate upside or downside." onChange={(value) => update("marketPrice", value)}/>
        <NumberField label="Cash" value={model.cash} suffix="$M" help="Available cash added in the enterprise-to-equity bridge." onChange={(value) => update("cash", value)}/>
        <NumberField label="Funded debt" value={model.debt} suffix="$M" help="Debt subtracted from enterprise value. Review leases and other claims separately." onChange={(value) => update("debt", value)}/>
        <NumberField label="Diluted shares" value={model.shares} suffix="M" help="Share count used to calculate value per share; check multi-class shares and dilution." onChange={(value) => update("shares", value)}/>
      </div>
      <div className="assumption-bottom"><div className="wacc-table"><div className="sheet-bar">WACC reference build</div><div><span>Risk-free rate</span><b>{fmt.format(riskFree)}%</b></div><div><span>Beta</span><b>{fmt.format(beta)}×</b></div><div><span>Equity risk premium</span><b>{fmt.format(equityRiskPremium)}%</b></div><div><span>Implied cost of equity</span><b>{fmt.format(costEquity)}%</b></div><div><span>Equity / capital</span><b>{fmt.format(equityWeight * 100)}%</b></div><div><span>Pre-tax cost of debt</span><b>{fmt.format(preTaxDebt)}%</b></div><div><span>Debt / capital</span><b>{fmt.format(debtWeight * 100)}%</b></div><div className="total"><span>Formula reference WACC</span><b>{fmt.format(referenceWacc)}%</b></div><small>The editable model WACC can include additional size, country, concentration, and execution risk.</small></div>
        <div className="data-check"><div className="sheet-bar">Data checks</div><ul>{(data.qualityNotes?.length ? data.qualityNotes : ["Sample data is active. Enter a ticker to load provider financials."]).map((note) => <li key={note}>{note}</li>)}</ul></div>
      </div>
    </section>

    <section className="sheet-section" id="price-history">
      <div className="section-heading"><div><span className="section-index">04</span><p>MARKET DATA</p><h2>Stock price history</h2></div><div className="unit-note">MONTH-END CLOSE · SELECT A PERIOD</div></div>
      <StockPriceChart points={data.market.priceHistory || []} symbol={data.company.symbol}/>
    </section>

    <CompetitorComparison data={data}/>

    <section className="sheet-section" id="risks">
      <div className="section-heading"><div><span className="section-index">06</span><p>DECISION REVIEW</p><h2>Potential risks</h2></div><p className="section-description">Automated screening flags based on available financials, domicile, industry, and the selected DCF method. Verify material risks in company filings.</p></div>
      <div className="risk-grid">{risks.map((risk) => <article key={risk.title}><span className={`risk-pill ${risk.level}`}>{risk.level}</span><h3>{risk.title}</h3><p>{risk.detail}</p></article>)}</div>
      <div className="decision-checklist"><h3>Investment-decision checklist</h3><ul><li>Read the latest annual report, risk factors, and management guidance.</li><li>Map revenue, suppliers, and operations by country.</li><li>Compare assumptions with direct peers and a full business cycle.</li><li>Stress-test dilution, acquisitions, regulation, and refinancing.</li><li>Define the evidence that would invalidate the thesis.</li><li>Require a margin of safety appropriate for forecast uncertainty.</li></ul></div>
    </section>

    <LearningWalkthrough data={data} model={model} result={result} method={method}/>
    <footer><span>Educational decision support only—not personalized investment advice.</span><span>MODEL V2 · DATA MAY BE DELAYED</span></footer>
  </main>;
}
