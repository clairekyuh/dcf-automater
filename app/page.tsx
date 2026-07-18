"use client";

import { FormEvent, useMemo, useState } from "react";

type CompanyData = {
  source: string; asOf: string;
  company: { symbol: string; name: string; description: string; exchange: string; currency: string; country: string; sector: string; industry: string };
  market: { marketCap: number; shares: number; estimatedPrice: number; beta: number };
  metrics: { revenueGrowth: number; revenue: number; ebitMargin: number; capexPercentRevenue: number; cash: number; debt: number; taxRate: number };
  historical: Array<{ year: string; revenue: number; ebitMargin: number; capex: number; capexPercentRevenue: number; freeCashFlow: number }>;
};

type Model = { growth: number; margin: number; tax: number; da: number; capex: number; nwc: number; wacc: number; terminalGrowth: number; exitMultiple: number; cash: number; debt: number; shares: number; marketPrice: number };

const demo: CompanyData = {
  source: "Sample data", asOf: "2025-12-31",
  company: { symbol: "DEMO", name: "Northstar Systems", description: "Sample technology company used to demonstrate the full valuation workflow before an API key is configured.", exchange: "NASDAQ", currency: "USD", country: "USA", sector: "Technology", industry: "Software—Infrastructure" },
  market: { marketCap: 12500, shares: 250, estimatedPrice: 50, beta: 1.15 },
  metrics: { revenueGrowth: 12, revenue: 2400, ebitMargin: 24, capexPercentRevenue: 4, cash: 650, debt: 320, taxRate: 21 },
  historical: [
    { year: "2021", revenue: 1450, ebitMargin: 17, capex: 62, capexPercentRevenue: 4.3, freeCashFlow: 180 },
    { year: "2022", revenue: 1650, ebitMargin: 19, capex: 70, capexPercentRevenue: 4.2, freeCashFlow: 230 },
    { year: "2023", revenue: 1880, ebitMargin: 20, capex: 78, capexPercentRevenue: 4.1, freeCashFlow: 282 },
    { year: "2024", revenue: 2150, ebitMargin: 22, capex: 86, capexPercentRevenue: 4, freeCashFlow: 350 },
    { year: "2025", revenue: 2400, ebitMargin: 24, capex: 96, capexPercentRevenue: 4, freeCashFlow: 410 },
  ],
};

const industryRules = [
  { match: /software|internet|semiconductor|technology/i, multiple: 18, wacc: 9.5, terminal: 3, note: "Asset-light growth businesses often trade on higher EBITDA multiples, but face faster competitive disruption." },
  { match: /bank|insurance|financial/i, multiple: 11, wacc: 9, terminal: 2.5, note: "Financial companies are usually better valued with sector-specific equity methods; this unlevered DCF is only a directional cross-check." },
  { match: /biotech|pharma|health/i, multiple: 14, wacc: 10, terminal: 2.5, note: "Pipeline, patent, reimbursement, and regulatory outcomes can dominate historical financial trends." },
  { match: /oil|gas|energy|mining/i, multiple: 7, wacc: 10, terminal: 1.5, note: "Commodity cycles and reserve replacement make normalized margins more useful than a single recent year." },
  { match: /utility|telecom/i, multiple: 8, wacc: 7.5, terminal: 2, note: "Stable demand can support lower discount rates, while leverage and capital intensity constrain flexibility." },
  { match: /retail|consumer|restaurant/i, multiple: 10, wacc: 9, terminal: 2.5, note: "Brand strength, same-store growth, input costs, and consumer cycles are key valuation drivers." },
  { match: /industrial|manufactur|aerospace|transport/i, multiple: 9, wacc: 9, terminal: 2.25, note: "Backlogs and operating leverage help visibility, but cyclicality and capital spending increase downside risk." },
];

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function recommendations(data: CompanyData) {
  const text = `${data.company.sector} ${data.company.industry}`;
  const rule = industryRules.find((item) => item.match.test(text)) || { multiple: 10, wacc: 9.5, terminal: 2.5, note: "Use a conservative market multiple and compare it with mature peers in the same industry." };
  const growth = clamp(data.metrics.revenueGrowth, -5, 20);
  return { ...rule, growth: Math.round(clamp(growth * 0.65, 2, 15) * 10) / 10, margin: Math.round(clamp(data.metrics.ebitMargin, 3, 40) * 10) / 10 };
}

function buildModel(data: CompanyData): Model {
  const rec = recommendations(data);
  const round1 = (value: number) => Math.round(value * 10) / 10;
  return { growth: rec.growth, margin: rec.margin, tax: 21, da: round1(Math.max(2, data.metrics.capexPercentRevenue * .75)), capex: round1(Math.max(2, data.metrics.capexPercentRevenue)), nwc: 2, wacc: rec.wacc, terminalGrowth: rec.terminal, exitMultiple: rec.multiple, cash: data.metrics.cash, debt: data.metrics.debt, shares: data.market.shares || 1, marketPrice: Math.round(data.market.estimatedPrice * 100) / 100 };
}

function calculate(data: CompanyData, model: Model, method: "perpetuity" | "multiple", growthShift = 0, marginShift = 0) {
  let revenue = data.metrics.revenue;
  let previousRevenue = revenue;
  const wacc = model.wacc / 100;
  const years = Array.from({ length: 5 }, (_, index) => {
    const year = index + 1;
    const fade = 1 - index * .1;
    const growth = Math.max(model.terminalGrowth, (model.growth + growthShift) * fade) / 100;
    revenue *= 1 + growth;
    const ebit = revenue * ((model.margin + marginShift) / 100);
    const tax = Math.max(0, ebit * model.tax / 100);
    const nopat = ebit - tax;
    const depreciation = revenue * model.da / 100;
    const capex = revenue * model.capex / 100;
    const changeNwc = Math.max(0, revenue - previousRevenue) * model.nwc / 100;
    const fcf = nopat + depreciation - capex - changeNwc;
    const discountFactor = 1 / Math.pow(1 + wacc, year);
    previousRevenue = revenue;
    return { year, growth: growth * 100, revenue, ebit, tax, nopat, depreciation, capex, changeNwc, fcf, discountFactor, pv: fcf * discountFactor };
  });
  const last = years[4];
  const terminalValue = method === "perpetuity"
    ? model.wacc > model.terminalGrowth ? last.fcf * (1 + model.terminalGrowth / 100) / (wacc - model.terminalGrowth / 100) : 0
    : (last.ebit + last.depreciation) * model.exitMultiple;
  const pvTerminal = terminalValue * last.discountFactor;
  const pvForecast = years.reduce((sum, year) => sum + year.pv, 0);
  const enterpriseValue = pvForecast + pvTerminal;
  const equityValue = enterpriseValue + model.cash - model.debt;
  const perShare = equityValue / Math.max(model.shares, 1);
  return { years, terminalValue, pvTerminal, pvForecast, enterpriseValue, equityValue, perShare, terminalShare: enterpriseValue ? pvTerminal / enterpriseValue * 100 : 0 };
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

function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" step="0.1" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} /><b>{suffix}</b></div></label>;
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
      const response = await fetch(`/api/company?symbol=${encodeURIComponent(ticker.trim().toUpperCase())}`);
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

    <section className="model-shell">
      <aside>
        <div className="section-title"><span>01</span><h2>Editable assumptions</h2></div>
        <div className="recommendation"><b>INDUSTRY STARTING POINT</b><p>{rec.note}</p><small>Recommendations are heuristics, not observed peer medians. Modify them to match your thesis.</small></div>
        <div className="field-grid">
          <NumberField label="Revenue growth" value={model.growth} suffix="%" onChange={(v)=>update("growth",v)} />
          <NumberField label="Target EBIT margin" value={model.margin} suffix="%" onChange={(v)=>update("margin",v)} />
          <NumberField label="Tax rate" value={model.tax} suffix="%" onChange={(v)=>update("tax",v)} />
          <NumberField label="D&A / revenue" value={model.da} suffix="%" onChange={(v)=>update("da",v)} />
          <NumberField label="Capex / revenue" value={model.capex} suffix="%" onChange={(v)=>update("capex",v)} />
          <NumberField label="NWC / new revenue" value={model.nwc} suffix="%" onChange={(v)=>update("nwc",v)} />
          <NumberField label="WACC" value={model.wacc} suffix="%" onChange={(v)=>update("wacc",v)} />
          <NumberField label="Terminal growth" value={model.terminalGrowth} suffix="%" onChange={(v)=>update("terminalGrowth",v)} />
          <NumberField label="Exit EBITDA multiple" value={model.exitMultiple} suffix="×" onChange={(v)=>update("exitMultiple",v)} />
          <NumberField label="Market price" value={model.marketPrice} suffix="$" onChange={(v)=>update("marketPrice",v)} />
        </div>
        <details><summary>Capital structure inputs</summary><div className="field-grid compact"><NumberField label="Cash" value={model.cash} suffix="$M" onChange={(v)=>update("cash",v)} /><NumberField label="Debt" value={model.debt} suffix="$M" onChange={(v)=>update("debt",v)} /><NumberField label="Diluted shares" value={model.shares} suffix="M" onChange={(v)=>update("shares",v)} /></div></details>
      </aside>

      <article className="results">
        <div className="result-head"><div className="section-title"><span>02</span><h2>DCF valuation</h2></div><div className="method-toggle"><button className={method==="perpetuity"?"active":""} onClick={()=>setMethod("perpetuity")}>Perpetuity growth</button><button className={method==="multiple"?"active":""} onClick={()=>setMethod("multiple")}>Exit multiple</button></div></div>
        {model.wacc <= model.terminalGrowth && method === "perpetuity" ? <div className="api-error">WACC must be greater than terminal growth.</div> : <>
          <div className="hero-value"><div><p>IMPLIED VALUE PER SHARE</p><strong>{usd.format(result.perShare)}</strong></div><div className={result.perShare >= model.marketPrice ? "upside positive" : "upside negative"}><span>VS. EST. PRICE</span><b>{model.marketPrice ? fmt.format((result.perShare/model.marketPrice-1)*100) : "—"}%</b></div></div>
          <div className="metrics"><div><span>Enterprise value</span><b>{usd0.format(result.enterpriseValue)}M</b></div><div><span>Equity value</span><b>{usd0.format(result.equityValue)}M</b></div><div><span>Terminal value share</span><b>{fmt.format(result.terminalShare)}%</b></div></div>
        </>}

        <div className="forecast"><div className="table-title"><h3>Five-year cash-flow build</h3><span>USD MILLIONS</span></div><div className="table-scroll"><table><thead><tr><th>DCF step</th>{result.years.map(y=><th key={y.year}>YEAR {y.year}</th>)}</tr></thead><tbody>
          <tr><td>Revenue growth</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.growth)}%</td>)}</tr>
          <tr><td>Revenue</td>{result.years.map(y=><td key={y.year}>{fmt.format(y.revenue)}</td>)}</tr>
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
    <footer><span>Educational decision support only—not personalized investment advice.</span><span>DATA MAY BE DELAYED · MODEL V1.0</span></footer>
  </main>;
}
