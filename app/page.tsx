"use client";

import { useMemo, useState } from "react";

type Inputs = {
  company: string;
  revenue: number;
  growth: number;
  margin: number;
  tax: number;
  reinvestment: number;
  wacc: number;
  terminalGrowth: number;
  cash: number;
  debt: number;
  shares: number;
};

const initial: Inputs = {
  company: "Example Co.",
  revenue: 1000,
  growth: 10,
  margin: 22,
  tax: 21,
  reinvestment: 35,
  wacc: 9,
  terminalGrowth: 3,
  cash: 120,
  debt: 180,
  shares: 100,
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const perShare = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calculate(i: Inputs, growthAdjustment = 0) {
  const wacc = i.wacc / 100;
  const terminalGrowth = i.terminalGrowth / 100;
  let revenue = i.revenue;
  let pvCashFlows = 0;
  const years = Array.from({ length: 5 }, (_, index) => {
    const year = index + 1;
    revenue *= 1 + (i.growth + growthAdjustment) / 100;
    const ebit = revenue * (i.margin / 100);
    const nopat = ebit * (1 - i.tax / 100);
    const freeCashFlow = nopat * (1 - i.reinvestment / 100);
    const presentValue = freeCashFlow / Math.pow(1 + wacc, year);
    pvCashFlows += presentValue;
    return { year, revenue, freeCashFlow, presentValue };
  });
  const finalFcf = years[4].freeCashFlow;
  const terminalValue = wacc > terminalGrowth ? (finalFcf * (1 + terminalGrowth)) / (wacc - terminalGrowth) : 0;
  const pvTerminal = terminalValue / Math.pow(1 + wacc, 5);
  const enterpriseValue = pvCashFlows + pvTerminal;
  const equityValue = enterpriseValue + i.cash - i.debt;
  const valuePerShare = i.shares > 0 ? equityValue / i.shares : 0;
  return { years, pvCashFlows, pvTerminal, enterpriseValue, equityValue, valuePerShare };
}

function Field({ label, value, suffix, onChange }: { label: string; value: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {suffix && <b>{suffix}</b>}
      </div>
    </label>
  );
}

export default function Home() {
  const [inputs, setInputs] = useState(initial);
  const result = useMemo(() => calculate(inputs), [inputs]);
  const scenarios = useMemo(() => [
    { name: "Bear", adjustment: -3, result: calculate(inputs, -3) },
    { name: "Base", adjustment: 0, result },
    { name: "Bull", adjustment: 3, result: calculate(inputs, 3) },
  ], [inputs, result]);
  const invalid = inputs.wacc <= inputs.terminalGrowth;
  const update = (key: keyof Inputs, value: string | number) => setInputs((current) => ({ ...current, [key]: value }));

  return (
    <main>
      <nav>
        <a className="brand" href="#"><span>◆</span> INTRINSIC</a>
        <div className="nav-note">DCF WORKBENCH <i>●</i></div>
      </nav>

      <header>
        <p className="eyebrow">VALUATION, WITHOUT THE SPREADSHEET</p>
        <h1>Find what a business<br /><em>is really worth.</em></h1>
        <p className="lede">Adjust the assumptions. See the cash flows. Understand the value.</p>
      </header>

      <section className="workspace">
        <aside>
          <div className="section-title"><span>01</span><h2>Assumptions</h2></div>
          <label className="field wide"><span>Company</span><input value={inputs.company} onChange={(e) => update("company", e.target.value)} /></label>
          <div className="field-grid">
            <Field label="Revenue" value={inputs.revenue} suffix="$M" onChange={(v) => update("revenue", v)} />
            <Field label="Growth" value={inputs.growth} suffix="%" onChange={(v) => update("growth", v)} />
            <Field label="EBIT margin" value={inputs.margin} suffix="%" onChange={(v) => update("margin", v)} />
            <Field label="Tax rate" value={inputs.tax} suffix="%" onChange={(v) => update("tax", v)} />
            <Field label="Reinvestment" value={inputs.reinvestment} suffix="%" onChange={(v) => update("reinvestment", v)} />
            <Field label="WACC" value={inputs.wacc} suffix="%" onChange={(v) => update("wacc", v)} />
            <Field label="Terminal growth" value={inputs.terminalGrowth} suffix="%" onChange={(v) => update("terminalGrowth", v)} />
            <Field label="Diluted shares" value={inputs.shares} suffix="M" onChange={(v) => update("shares", v)} />
            <Field label="Cash" value={inputs.cash} suffix="$M" onChange={(v) => update("cash", v)} />
            <Field label="Debt" value={inputs.debt} suffix="$M" onChange={(v) => update("debt", v)} />
          </div>
          {invalid && <p className="warning">WACC must be greater than terminal growth.</p>}
          <p className="units">All monetary values are in USD millions.</p>
        </aside>

        <article className="results">
          <div className="result-head">
            <div className="section-title"><span>02</span><h2>Valuation</h2></div>
            <small>{inputs.company.toUpperCase()} · 5-YEAR MODEL</small>
          </div>
          <div className="hero-value">
            <p>IMPLIED VALUE PER SHARE</p>
            <strong>{invalid ? "—" : perShare.format(result.valuePerShare)}</strong>
            <span>BASE CASE</span>
          </div>
          <div className="metrics">
            <div><span>Enterprise value</span><b>{money.format(result.enterpriseValue)}M</b></div>
            <div><span>Equity value</span><b>{money.format(result.equityValue)}M</b></div>
            <div><span>Terminal value share</span><b>{result.enterpriseValue ? Math.round(result.pvTerminal / result.enterpriseValue * 100) : 0}%</b></div>
          </div>

          <div className="forecast">
            <div className="table-title"><h3>Cash-flow forecast</h3><span>USD MILLIONS</span></div>
            <table><thead><tr><th></th>{result.years.map((y) => <th key={y.year}>YR {y.year}</th>)}</tr></thead>
              <tbody>
                <tr><td>Revenue</td>{result.years.map((y) => <td key={y.year}>{Math.round(y.revenue).toLocaleString()}</td>)}</tr>
                <tr><td>Free cash flow</td>{result.years.map((y) => <td key={y.year}>{Math.round(y.freeCashFlow).toLocaleString()}</td>)}</tr>
                <tr><td>Present value</td>{result.years.map((y) => <td key={y.year}>{Math.round(y.presentValue).toLocaleString()}</td>)}</tr>
              </tbody>
            </table>
          </div>

          <div className="scenario-grid">
            {scenarios.map((s) => <div className={s.name === "Base" ? "active" : ""} key={s.name}><span>{s.name} case</span><b>{invalid ? "—" : perShare.format(s.result.valuePerShare)}</b><small>{s.adjustment > 0 ? "+" : ""}{s.adjustment}% growth</small></div>)}
          </div>
        </article>
      </section>

      <footer><span>For educational purposes only. Not investment advice.</span><span>MODEL V0.1</span></footer>
    </main>
  );
}
