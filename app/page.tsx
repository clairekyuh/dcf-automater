"use client";

import { FormEvent, useMemo, useState } from "react";

type CompanyData = {
  source: string; asOf: string; qualityNotes?: string[];
  company: { symbol: string; name: string; description: string; exchange: string; currency: string; country: string; sector: string; industry: string };
  market: { marketCap: number; shares: number; estimatedPrice: number; beta: number };
  metrics: { revenueGrowth: number; revenue: number; ebitMargin: number; capexPercentRevenue: number; daPercentRevenue: number; cash: number; debt: number; taxRate: number };
  historical: Array<{ year: string; revenue: number; ebitMargin: number; capex: number; capexPercentRevenue: number; freeCashFlow: number }>;
};

type Model = { growth: number; margin: number; tax: number; da: number; capex: number; nwc: number; wacc: number; terminalGrowth: number; exitMultiple: number; cash: number; debt: number; shares: number; marketPrice: number };

const demo: CompanyData = {
  source: "Sample data", asOf: "2025-12-31",
  company: { symbol: "DEMO", name: "Northstar Systems", description: "Sample technology company used to demonstrate the full valuation workflow before an API key is configured.", exchange: "NASDAQ", currency: "USD", country: "USA", sector: "Technology", industry: "Software—Infrastructure" },
  market: { marketCap: 12500, shares: 250, estimatedPrice: 50, beta: 1.15 },
  metrics: { revenueGrowth: 12, revenue: 2400, ebitMargin: 24, capexPercentRevenue: 4, daPercentRevenue: 3, cash: 650, debt: 320, taxRate: 21 },
  historical: [
    { year: "2021", revenue: 1450, ebitMargin: 17, capex: 62, capexPercentRevenue: 4.3, freeCashFlow: 180 },
    { year: "2022", revenue: 1650, ebitMargin: 19, capex: 70, capexPercentRevenue: 4.2, freeCashFlow: 230 },
    { year: "2023", revenue: 1880, ebitMargin: 20, capex: 78, capexPercentRevenue: 4.1, freeCashFlow: 282 },
    { year: "2024", revenue: 2150, ebitMargin: 22, capex: 86, capexPercentRevenue: 4, freeCashFlow: 350 },
    { year: "2025", revenue: 2400, ebitMargin: 24, capex: 96, capexPercentRevenue: 4, freeCashFlow: 410 },
  ],
};

const industryRules = [
  { match: /software|internet|semiconductor|technology/i, multiple: 18, wacc: 9.5, terminal: 3, margin: 22, note: "Technology businesses can support strong margins, but infrastructure-heavy firms require much more reinvestment than asset-light software companies." },
  { match: /bank|insurance|financial/i, multiple: 11, wacc: 9, terminal: 2.5, margin: 18, note: "Financial companies are usually better valued with sector-specific equity methods; this unlevered DCF is only a directional cross-check." },
  { match: /biotech|pharma|health/i, multiple: 14, wacc: 10, terminal: 2.5, margin: 18, note: "Pipeline, patent, reimbursement, and regulatory outcomes can dominate historical financial trends." },
  { match: /oil|gas|energy|mining/i, multiple: 7, wacc: 10, terminal: 1.5, margin: 15, note: "Commodity cycles and reserve replacement make normalized margins more useful than a single recent year." },
  { match: /utility|telecom/i, multiple: 8, wacc: 7.5, terminal: 2, margin: 18, note: "Stable demand can support lower discount rates, while leverage and capital intensity constrain flexibility." },
  { match: /retail|consumer|restaurant/i, multiple: 10, wacc: 9, terminal: 2.5, margin: 12, note: "Brand strength, same-store growth, input costs, and consumer cycles are key valuation drivers." },
  { match: /industrial|manufactur|aerospace|transport/i, multiple: 9, wacc: 9, terminal: 2.25, margin: 15, note: "Backlogs and operating leverage help visibility, but cyclicality and capital spending increase downside risk." },
];

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function recommendations(data: CompanyData) {
  const text = `${data.company.sector} ${data.company.industry}`;
  const rule = industryRules.find((item) => item.match.test(text)) || { multiple: 10, wacc: 9.5, terminal: 2.5, margin: 15, note: "Use a conservative market multiple and compare it with mature peers in the same industry." };
  const historicalGrowth = data.metrics.revenueGrowth;
  const growth = historicalGrowth > 100 ? 40 : historicalGrowth > 50 ? 30 : historicalGrowth > 25 ? 20 : clamp(historicalGrowth * 0.65, 2, 18);
  const margin = data.metrics.ebitMargin < 3 ? rule.margin : clamp(data.metrics.ebitMargin, 3, 40);
  const da = clamp(data.metrics.daPercentRevenue || data.metrics.capexPercentRevenue * .75, 1, 50);
  const capex = data.metrics.capexPercentRevenue > 50 ? clamp(da * 1.05, 20, 50) : clamp(data.metrics.capexPercentRevenue, 1, 30);
  const riskPremium = (historicalGrowth > 50 ? 1.5 : 0) + (data.metrics.debt > data.metrics.revenue * 2 ? 1.5 : 0);
  return { ...rule, growth: Math.round(growth * 10) / 10, margin: Math.round(margin * 10) / 10, da: Math.round(da * 10) / 10, capex: Math.round(capex * 10) / 10, wacc: Math.min(13, rule.wacc + riskPremium) };
}

function buildModel(data: CompanyData): Model {
  const rec = recommendations(data);
  const round1 = (value: number) => Math.round(value * 10) / 10;
  return { growth: rec.growth, margin: rec.margin, tax: 21, da: round1(rec.da), capex: round1(rec.capex), nwc: 2, wacc: rec.wacc, terminalGrowth: rec.terminal, exitMultiple: rec.multiple, cash: data.metrics.cash, debt: data.metrics.debt, shares: data.market.shares || 1, marketPrice: Math.round(data.market.estimatedPrice * 100) / 100 };
}

function calculate(data: CompanyData, model: Model, method: "perpetuity" | "multiple", growthShift = 0, marginShift = 0) {
  let revenue = data.metrics.revenue;
  let previousRevenue = revenue;
  const wacc = model.wacc / 100;
  const years = Array.from({ length: 5 }, (_, index) => {
    const year = index + 1;
    const fade = 1 - index * .2;
    const startingGrowth = Math.max(model.terminalGrowth, model.growth + growthShift);
    const growth = (model.terminalGrowth + (startingGrowth - model.terminalGrowth) * fade) / 100;
    revenue *= 1 + growth;
    const targetMargin = model.margin + marginShift;
    const forecastMargin = data.metrics.ebitMargin + (targetMargin - data.metrics.ebitMargin) * (year / 5);
    const ebit = revenue * (forecastMargin / 100);
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
    ? model.wacc > model.terminalGrowth ? last.fcf * (1 + model.terminalGrowth / 100) / (wacc - model.terminalGrowth / 100) : 0
    : (last.ebit + last.depreciation) * model.exitMultiple;
  const pvTerminal = terminalValue * last.discountFactor;
  const pvForecast = years.reduce((sum, year) => sum + year.pv, 0);
  const enterpriseValue = pvForecast + pvTerminal;
  const rawEquityValue = enterpriseValue + model.cash - model.debt;
  // Common equity has limited liability: its economic value cannot fall below zero.
  const equityValue = Math.max(0, rawEquityValue);
  const perShare = equityValue / Math.max(model.shares, 1);
  return { years, terminalValue, pvTerminal, pvForecast, enterpriseValue, rawEquityValue, equityValue, perShare, terminalShare: enterpriseValue ? pvTerminal / enterpriseValue * 100 : 0 };
}

function riskAnalysis(data: CompanyData, model: Model, result: ReturnType<typeof calculate>) {
  const risks: Array<{ level: "high" | "medium" | "low"; title: string; detail: string }> = [];
  const capex = data.metrics.capexPercentRevenue;
  risks.push({ level: capex > 12 ? "high" : capex > 6 ? "medium" : "low", title: "Capital intensity", detail: `${fmt.format(capex)}% of latest revenue was spent on capex. Higher needs can reduce cash available to shareholders.` });
  const leverage = data.metrics.debt / Math.max(data.metrics.revenue, 1);
  risks.push({ level: leverage > 1 ? "high" : leverage > .45 ? "medium" : "low", title: "Balance-sheet leverage", detail: `Debt equals ${fmt.format(leverage * 100)}% of annual revenue; refinancing risk rises when rates or earnings deteriorate.` });
  risks.push({ level: result.terminalShare > 80 ? "high" : result.terminalShare > 65 ? "medium" : "low", title: "Terminal-value dependence", detail: `${fmt.format(result.terminalShare)}% of enterprise value comes from cash flows beyond year five.` });
  const country = data.company.country || "Unknown";
  const geoHigh = /china|russia|taiwan|ukraine|israel/i.test(country);
  const geoMedium = /semiconductor|aerospace|defense|energy|mining|shipping|telecom/i.test(`${data.company.industry} ${data.company.sector}`);
  risks.push({ level: geoHigh ? "high" : geoMedium ? "medium" : "low", title: "Geopolitical exposure", detail: `${country} domicile and ${data.company.industry} industry exposure can create trade, sanctions, supply-chain, currency, or regulatory risk. This is a screening flag—not a full geographic revenue analysis.` });
  const margins = data.historical.map((row) => row.ebitMargin).filter(Number.isFinite);
  const spread = margins.length ? Math.max(...margins) - Math.min(...margins) : 0;
  risks.push({ level: spread > 15 ? "high" : spread > 7 ? "medium" : "low", title: "Margin stability", detail: `Historical EBIT margin range is ${fmt.format(spread)} percentage points. Wide swings reduce forecast reliability.` });
  const gap = model.marketPrice ? (result.perShare / model.marketPrice - 1) * 100 : 0;
  risks.push({ level: gap < 10 ? "high" : gap < 25 ? "medium" : "low", title: "Valuation cushion", detail: `The base case implies ${fmt.format(gap)}% upside/downside versus the estimated market price. Small cushions leave little room for forecasting error.` });
  return risks;
}

function NumberField({ label, value, suffix, help, onChange }: { label: string; value: number; suffix: string; help: string; onChange: (value: number) => void }) {
  const [showHelp, setShowHelp] = useState(false);
  return <div className="number-field"><div className="field-label"><span>{label}</span><button type="button" aria-label={`Explain ${label}`} aria-expanded={showHelp} onClick={() => setShowHelp((open) => !open)}>?</button></div><div><input aria-label={`${label} ${suffix}`} type="number" step="0.1" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} /><b>{suffix}</b></div>{showHelp && <p className="field-help">{help}</p>}</div>;
}

function LearningWalkthrough({ data, model, result, method }: { data: CompanyData; model: Model; result: ReturnType<typeof calculate>; method: "perpetuity" | "multiple" }) {
  const [step, setStep] = useState(0);
  const first = result.years[0];
  const last = result.years[4];
  const steps = [
    {
      title: "Begin with the business, not the formula",
      concept: "A DCF estimates what a company is worth today by forecasting the cash it can generate, then reducing future cash to today's dollars.",
      formula: "Value today = Present value of forecast cash flows + present value of terminal value",
      example: `${data.company.name} begins with ${usd0.format(data.metrics.revenue)}M of latest annual revenue.`,
      question: "Do you understand how the company makes money, its competitive advantage, and what could permanently impair it?",
    },
    {
      title: "Forecast revenue",
      concept: "Revenue is the top line. Growth should normally slow as a company becomes larger, which is why this model gradually fades the selected growth rate.",
      formula: "Next-year revenue = Current revenue × (1 + growth rate)",
      example: `${usd0.format(data.metrics.revenue)}M × (1 + ${fmt.format(first.growth)}%) = ${usd0.format(first.revenue)}M in Year 1.`,
      question: `Is ${fmt.format(model.growth)}% growth realistic compared with history, the ${data.company.industry} market, and competitors?`,
    },
    {
      title: "Convert sales into operating profit",
      concept: "EBIT is profit from operations before interest and tax. The EBIT margin captures pricing power, product mix, labor, and operating efficiency.",
      formula: "EBIT = Revenue × EBIT margin",
      example: `${usd0.format(first.revenue)}M × ${fmt.format(model.margin)}% = ${usd0.format(first.ebit)}M of Year 1 EBIT.`,
      question: "Could competition, input costs, regulation, or product mix push the margin above or below your target?",
    },
    {
      title: "Calculate after-tax operating profit",
      concept: "NOPAT treats the business as if it had no debt, keeping the operating forecast separate from financing decisions.",
      formula: "NOPAT = EBIT × (1 − tax rate)",
      example: `${usd0.format(first.ebit)}M − ${usd0.format(first.tax)}M of modeled tax = ${usd0.format(first.nopat)}M of NOPAT.`,
      question: "Is the normalized tax rate appropriate, or are recent tax benefits and charges temporary?",
    },
    {
      title: "Account for reinvestment",
      concept: "Accounting profit is not cash flow. Add back non-cash D&A, then subtract capital expenditures and cash tied up in working capital.",
      formula: "Unlevered FCF = NOPAT + D&A − Capex − Change in NWC",
      example: `${usd0.format(first.nopat)}M + ${usd0.format(first.depreciation)}M − ${usd0.format(first.capex)}M − ${usd0.format(first.changeNwc)}M = ${usd0.format(first.fcf)}M.`,
      question: "Does the growth forecast require more factories, equipment, inventory, or customer financing than the model assumes?",
    },
    {
      title: "Discount future cash flow",
      concept: "A dollar received later is worth less than a dollar today. WACC represents the return demanded by both shareholders and lenders for bearing risk.",
      formula: "Present value = Future FCF ÷ (1 + WACC)ⁿ",
      example: `Year 5 FCF of ${usd0.format(last.fcf)}M × ${last.discountFactor.toFixed(3)} = ${usd0.format(last.pv)}M today.`,
      question: `Does ${fmt.format(model.wacc)}% adequately reflect the company's cyclicality, leverage, size, country, and execution risk?`,
    },
    {
      title: "Estimate value after Year 5",
      concept: method === "perpetuity" ? "The Gordon Growth method assumes cash flow grows forever at a stable rate. Small changes to WACC or growth can move value sharply." : "The exit-multiple method assumes the company can be sold at a selected EBITDA multiple in Year 5. It anchors value to market pricing.",
      formula: method === "perpetuity" ? "Terminal value = Year 5 FCF × (1 + g) ÷ (WACC − g)" : "Terminal value = Year 5 EBITDA × exit multiple",
      example: `${method === "perpetuity" ? `${usd0.format(last.fcf)}M at ${fmt.format(model.terminalGrowth)}% perpetual growth` : `${usd0.format(last.ebit + last.depreciation)}M of Year 5 EBITDA at ${fmt.format(model.exitMultiple)}×`} = ${usd0.format(result.terminalValue)}M before discounting.`,
      question: `Terminal value is ${fmt.format(result.terminalShare)}% of enterprise value. Is that much dependence on the distant future acceptable?`,
    },
    {
      title: "Bridge enterprise value to equity value",
      concept: "The operating assets belong to both debt and equity investors. Add excess cash and subtract debt to isolate the value attributable to common shareholders.",
      formula: "Equity value = Enterprise value + Cash − Debt",
      example: `${usd0.format(result.enterpriseValue)}M + ${usd0.format(model.cash)}M − ${usd0.format(model.debt)}M = ${usd0.format(result.rawEquityValue)}M before applying the $0 common-equity floor.`,
      question: "Are there leases, pensions, minority interests, options, or other claims that should also be included?",
    },
    {
      title: "Calculate value per share—and stay skeptical",
      concept: "Divide equity value by diluted shares, then compare it with market price. The gap is a scenario result, not proof that the stock is cheap or expensive.",
      formula: "Intrinsic value per share = Equity value ÷ Diluted shares",
      example: `${usd0.format(result.equityValue)}M ÷ ${fmt.format(model.shares)}M shares = ${usd.format(result.perShare)} per share.`,
      question: `What would need to be true for this value to be wrong, and is the gap versus ${usd.format(model.marketPrice)} large enough to absorb those errors?`,
    },
  ];
  const active = steps[step];
  return <section className="learning-section" id="learn-dcf">
    <div className="learning-intro"><div><p className="eyebrow">GUIDED LEARNING MODE</p><h2>Walk through this DCF, one idea at a time.</h2><p>Every example below uses the company and assumptions currently loaded above. Change an input and the lesson updates with it.</p></div><div className="lesson-count"><strong>{String(step + 1).padStart(2, "0")}</strong><span>OF {String(steps.length).padStart(2, "0")}</span></div></div>
    <div className="lesson-progress" aria-label="DCF learning steps">{steps.map((item, index) => <button type="button" key={item.title} className={index === step ? "active" : index < step ? "complete" : ""} aria-label={`Step ${index + 1}: ${item.title}`} onClick={() => setStep(index)}><span>{index + 1}</span></button>)}</div>
    <div className="lesson-card" aria-live="polite">
      <div className="lesson-main"><span className="lesson-kicker">STEP {step + 1}</span><h3>{active.title}</h3><p>{active.concept}</p><div className="formula"><span>FORMULA</span><code>{active.formula}</code></div></div>
      <div className="lesson-side"><div><span>WITH THIS COMPANY</span><p>{active.example}</p></div><div className="challenge"><span>QUESTION TO ASK</span><p>{active.question}</p></div></div>
    </div>
    <div className="lesson-controls"><button type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>← Previous</button><span>{active.title}</span><button type="button" disabled={step === steps.length - 1} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>Next step →</button></div>
  </section>;
}

export default function Home() {
  const [ticker, setTicker] = useState("IBM");
  const [data, setData] = useState<CompanyData>(demo);
  const [model, setModel] = useState<Model>(() => buildModel(demo));
  const [method, setMethod] = useState<"perpetuity" | "multiple">("perpetuity");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rec = useMemo(() => recommendations(data), [data]);
  const result = useMemo(() => calculate(data, model, method), [data, model, method]);
  const risks = useMemo(() => riskAnalysis(data, model, result), [data, model, result]);
  const scenarios = useMemo(() => [
    { name: "Bear", result: calculate(data, model, method, -3, -3) },
    { name: "Base", result },
    { name: "Bull", result: calculate(data, model, method, 3, 3) },
  ], [data, model, method, result]);
  const update = (key: keyof Model, value: number) => setModel((current) => ({ ...current, [key]: value }));

  async function search(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      // Financial statements and normalization rules must not be served from a stale browser cache.
      const response = await fetch(`/api/company?symbol=${encodeURIComponent(ticker.trim().toUpperCase())}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to load company.");
      setData(json); setModel(buildModel(json));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load company."); }
    finally { setLoading(false); }
  }

  return <main>
    <nav><a className="brand" href="#top"><span>◆</span> INTRINSIC</a><div className="nav-note">DECISION WORKBENCH <i>●</i></div></nav>
    <header id="top"><p className="eyebrow">FROM TICKER TO INVESTMENT THESIS</p><h1>See the assumptions.<br/><em>Stress-test the value.</em></h1><p className="lede">Company fundamentals, a transparent DCF, and risk flags in one editable workflow.</p>
      <form className="ticker-search" onSubmit={search}><div><span>TICKER</span><input aria-label="Ticker symbol" value={ticker} onChange={(e)=>setTicker(e.target.value.toUpperCase())} placeholder="AAPL" /></div><button disabled={loading}>{loading ? "LOADING…" : "ANALYZE COMPANY →"}</button></form>
      {error && <div className="api-error"><b>Data connection:</b> {error}</div>}
      <p className="demo-note">Powered by Alpha Vantage. The free plan supports approximately six full ticker analyses per day.</p>
    </header>

    <section className="company-card">
      <div className="company-heading"><div><span>{data.company.exchange} · {data.company.symbol}</span><h2>{data.company.name}</h2></div><div className="price"><span>EST. MARKET PRICE</span><b>{usd.format(model.marketPrice)}</b></div></div>
      <div className="tags"><span>{data.company.sector}</span><span>{data.company.industry}</span><span>{data.company.country}</span></div>
      <p>{data.company.description}</p><small>Source: {data.source} · Financials as of {data.asOf} · Values in {data.company.currency} millions</small>
    </section>

    {data.qualityNotes?.length ? <section className="data-quality"><div><span>DATA CHECK</span><h2>What was verified—and what still needs judgment</h2></div><ul>{data.qualityNotes.map((note) => <li key={note}>{note}</li>)}</ul></section> : null}

    <section className="model-shell">
      <aside>
        <div className="section-title"><span>02</span><h2>Editable assumptions</h2></div>
        <div className="recommendation"><b>INDUSTRY STARTING POINT</b><p>{rec.note}</p><small>Recommendations are heuristics, not observed peer medians. Modify them to match your thesis.</small></div>
        <div className="field-grid">
          <NumberField label="Revenue growth" value={model.growth} suffix="%" help="Expected annual sales growth. The model fades this rate over time as the company matures." onChange={(v)=>update("growth",v)} />
          <NumberField label="Target EBIT margin" value={model.margin} suffix="%" help="Operating profit before interest and tax as a percentage of revenue. It reflects pricing, costs, and operating efficiency." onChange={(v)=>update("margin",v)} />
          <NumberField label="Tax rate" value={model.tax} suffix="%" help="A normalized cash tax rate applied to operating profit. One-time tax benefits should usually be excluded." onChange={(v)=>update("tax",v)} />
          <NumberField label="D&A / revenue" value={model.da} suffix="%" help="Depreciation and amortization are non-cash accounting expenses, so they are added back when calculating cash flow." onChange={(v)=>update("da",v)} />
          <NumberField label="Capex / revenue" value={model.capex} suffix="%" help="Cash spent on long-term assets such as equipment, stores, factories, and data centers. Capex reduces free cash flow." onChange={(v)=>update("capex",v)} />
          <NumberField label="NWC / new revenue" value={model.nwc} suffix="%" help="Cash absorbed by receivables, inventory, and other working-capital needs as the company grows." onChange={(v)=>update("nwc",v)} />
          <NumberField label="WACC" value={model.wacc} suffix="%" help="The required return for all capital providers. More risk generally means a higher WACC and a lower present value." onChange={(v)=>update("wacc",v)} />
          <NumberField label="Terminal growth" value={model.terminalGrowth} suffix="%" help="The perpetual growth rate after Year 5. It should be conservative and must remain below WACC." onChange={(v)=>update("terminalGrowth",v)} />
          <NumberField label="Exit EBITDA multiple" value={model.exitMultiple} suffix="×" help="The assumed market valuation multiple applied to Year 5 EBITDA when using the exit-multiple method." onChange={(v)=>update("exitMultiple",v)} />
          <NumberField label="Market price" value={model.marketPrice} suffix="$" help="The estimated current share price used only for comparison with modeled intrinsic value." onChange={(v)=>update("marketPrice",v)} />
        </div>
        <details><summary>Capital structure inputs</summary><div className="field-grid compact"><NumberField label="Cash" value={model.cash} suffix="$M" help="Cash is added to enterprise value because it belongs to investors and is separate from operating assets." onChange={(v)=>update("cash",v)} /><NumberField label="Debt" value={model.debt} suffix="$M" help="Debt is subtracted from enterprise value because lenders have a claim ahead of common shareholders." onChange={(v)=>update("debt",v)} /><NumberField label="Diluted shares" value={model.shares} suffix="M" help="Shares including expected dilution from options and other equity awards. More shares reduce value per share." onChange={(v)=>update("shares",v)} /></div></details>
      </aside>

      <article className="results">
        <div className="result-head"><div className="section-title"><span>01</span><h2>DCF valuation</h2></div><div className="method-toggle"><button className={method==="perpetuity"?"active":""} onClick={()=>setMethod("perpetuity")}>Perpetuity growth</button><button className={method==="multiple"?"active":""} onClick={()=>setMethod("multiple")}>Exit multiple</button></div></div>
        {model.wacc <= model.terminalGrowth && method === "perpetuity" ? <div className="api-error">WACC must be greater than terminal growth.</div> : <>
          <div className="hero-value"><div><p>IMPLIED VALUE PER SHARE</p><strong>{usd.format(result.perShare)}</strong></div><div className={result.perShare >= model.marketPrice ? "upside positive" : "upside negative"}><span>VS. EST. PRICE</span><b>{model.marketPrice ? fmt.format((result.perShare/model.marketPrice-1)*100) : "—"}%</b></div></div>
          <div className="metrics"><div><span>Enterprise value</span><b>{usd0.format(result.enterpriseValue)}M</b></div><div><span>Equity value</span><b>{usd0.format(result.equityValue)}M</b></div><div><span>Terminal value share</span><b>{fmt.format(result.terminalShare)}%</b></div></div>
          {result.rawEquityValue < 0 && <div className="negative-explainer"><span>WHY THE EQUITY VALUE HIT ZERO</span><h3>The model values the operations below net debt.</h3><p>Enterprise value of {usd0.format(result.enterpriseValue)}M plus {usd0.format(model.cash)}M of cash is {usd0.format(Math.abs(result.rawEquityValue))}M short of covering {usd0.format(model.debt)}M of funded debt. The mathematical bridge is negative, but common stock has limited liability, so the website displays a $0 floor—not a negative share price.</p><p>This does not mean the company is literally worth less than zero. It means these growth, margin, reinvestment, and discount-rate assumptions do not create enough operating value for common shareholders. Change them only when you have evidence for a different forecast.</p></div>}
        </>}

        <div className="forecast"><div className="table-title"><h3>Five-year cash-flow build</h3><span>USD MILLIONS</span></div><div className="table-scroll"><table><thead><tr><th>DCF step</th>{result.years.map(y=><th key={y.year}>YEAR {y.year}</th>)}</tr></thead><tbody>
          <tr><td>Revenue growth</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.growth)}%</td>)}</tr>
          <tr><td>Revenue</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.revenue)}</td>)}</tr>
          <tr><td>EBIT margin</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.margin)}%</td>)}</tr>
          <tr><td>EBIT</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.ebit)}</td>)}</tr>
          <tr><td>− Cash taxes</td>{result.years.map(y=><td key={y.year}>({fmt.format(y.tax)})</td>)}</tr>
          <tr><td>= NOPAT</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.nopat)}</td>)}</tr>
          <tr><td>+ D&A</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.depreciation)}</td>)}</tr>
          <tr><td>− Capex</td>{result.years.map(y=><td key={y.year}>({fmt.format(y.capex)})</td>)}</tr>
          <tr><td>− Change in NWC</td>{result.years.map(y=><td key={y.year}>({fmt.format(y.changeNwc)})</td>)}</tr>
          <tr className="total"><td>= Unlevered FCF</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.fcf)}</td>)}</tr>
          <tr><td>Discount factor</td>{result.years.map(y=><td key={y.year}>{y.discountFactor.toFixed(3)}</td>)}</tr>
          <tr className="total"><td>= Present value</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.pv)}</td>)}</tr>
        </tbody></table></div></div>

        <div className="terminal-box"><span>TERMINAL VALUE — {method === "perpetuity" ? "GORDON GROWTH" : "EXIT MULTIPLE"}</span><code>{method === "perpetuity" ? `Year 5 FCF × (1 + ${model.terminalGrowth}%) ÷ (${model.wacc}% − ${model.terminalGrowth}%)` : `Year 5 EBITDA × ${model.exitMultiple}×`}</code><b>{usd0.format(result.terminalValue)}M undiscounted</b></div>
        <div className="scenario-grid">{scenarios.map(s=><div className={s.name==="Base"?"active":""} key={s.name}><span>{s.name} case</span><b>{usd.format(s.result.perShare)}</b><small>{s.name==="Bear"?"Growth & margin −3 pts":s.name==="Bull"?"Growth & margin +3 pts":"Current assumptions"}</small></div>)}</div>
      </article>
    </section>

    <section className="history-section"><div className="section-title"><span>03</span><h2>Historical foundation</h2></div><div className="history-grid">{data.historical.map(row=><div key={row.year}><span>{row.year}</span><b>{usd0.format(row.revenue)}M</b><small>Revenue</small><p>{fmt.format(row.ebitMargin)}% EBIT margin<br/>{fmt.format(row.capexPercentRevenue)}% capex / sales<br/>{usd0.format(row.freeCashFlow)}M FCF</p></div>)}</div></section>

    <section className="risk-section"><div className="risk-heading"><div className="section-title"><span>04</span><h2>Decision risk dashboard</h2></div><p>Automated screening flags derived from available financials, domicile, industry, and model outputs. Verify material risks in company filings.</p></div><div className="risk-grid">{risks.map(r=><div key={r.title}><span className={`risk-pill ${r.level}`}>{r.level}</span><h3>{r.title}</h3><p>{r.detail}</p></div>)}</div>
      <div className="decision-checklist"><h3>Before making a decision</h3><ul><li>Read the latest annual report, risk factors, and management guidance.</li><li>Map revenue, suppliers, and manufacturing by country; the API does not provide full geographic exposure.</li><li>Compare assumptions with several direct peers and through a full business cycle.</li><li>Stress-test dilution, acquisitions, regulation, commodity inputs, and refinancing.</li><li>Decide what evidence would invalidate your thesis and demand a margin of safety.</li></ul></div>
    </section>

    <LearningWalkthrough data={data} model={model} result={result} method={method} />
    <footer><span>Educational decision support only—not personalized investment advice.</span><span>DATA MAY BE DELAYED · MODEL V1.0</span></footer>
  </main>;
}
