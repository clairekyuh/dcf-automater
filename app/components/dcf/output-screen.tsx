import { DcfRowLabel } from "@/app/components/dcf/defined-term";
import type { CompanyData, RiskItem } from "@/lib/company-data";
import { calculateDcf, calculateWacc, fiscalPeriodLabel, type DcfMethod, type DcfModel } from "@/lib/dcf-engine";
import Link from "next/link";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const pct2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function briefDescription(description: string) {
  const clean = description.trim();
  if (!clean) return "A factual company description was not available from Nasdaq or the latest SEC filing.";
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const brief = sentences.slice(0, 2).join(" ").trim();
  return brief.length > 420 ? `${brief.slice(0, 417).trimEnd()}…` : brief;
}

export default function OutputScreen({
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
  model: DcfModel;
  perpetuity: ReturnType<typeof calculateDcf>;
  multiple: ReturnType<typeof calculateDcf>;
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
  const sensitivityValue = (method: DcfMethod, wacc: number, terminal: number) => {
    const scenario = method === "perpetuity"
      ? calculateDcf(data, model, method, { wacc, terminalGrowth: terminal })
      : calculateDcf(data, model, method, { wacc, exitMultiple: terminal });
    return scenario.valid ? usd.format(scenario.perShare) : "—";
  };
  return <div className="output-screen">
    <div className="output-hero">
      <div className="output-company">
        <span>DCF summary · {data.company.exchange} · {data.company.symbol}</span>
        <h3>{data.company.name}</h3>
        <p>{briefDescription(data.company.description)}</p>
        <Link href={`/company-analysis?symbol=${encodeURIComponent(data.company.symbol)}`}>Company and credit analysis →</Link>
      </div>
      <div className="output-price"><span>Market price</span><strong>{usd.format(model.marketPrice)}</strong><small>{data.market.priceDate ? `Nasdaq close · ${data.market.priceDate}` : data.market.priceBasis || "Editable market-price input"}</small></div>
    </div>
    {financialUnsupported ? <div className="output-sector-limit"><b>STANDARD DCF NOT APPROPRIATE</b><p>Use a bank- or insurer-specific framework built around regulatory capital, asset quality, funding economics, tangible book value, and return on equity. The comps and pitch-deck views remain available as research summaries.</p></div> : <>
      <div className="output-valuation-grid">
        <article><span>Perpetual-growth value</span><strong>{perpetuity.valid ? usd.format(perpetuity.perShare) : "—"}</strong><small>{perpetuity.valid ? `${fmt.format((perpetuity.perShare / Math.max(model.marketPrice, .01) - 1) * 100)}% versus price` : perpetuity.invalidReason}</small></article>
        <article><span>Exit-multiple value</span><strong>{multiple.valid ? usd.format(multiple.perShare) : "—"}</strong><small>{multiple.valid ? `${fmt.format((multiple.perShare / Math.max(model.marketPrice, .01) - 1) * 100)}% versus price` : multiple.invalidReason}</small></article>
        <article className="output-range"><span>Scenario range</span><strong>{lowValue === null || highValue === null ? "—" : lowValue === highValue ? usd.format(lowValue) : `${usd.format(lowValue)}–${usd.format(highValue)}`}</strong><small>{rangeMove === null ? "No valid market comparison" : `${rangeMove >= 0 ? "Lower scenario upside" : "Lower scenario downside"}: ${fmt.format(Math.abs(rangeMove))}%`}</small></article>
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
    {!financialUnsupported && <a className="output-deep-link" href="#build">Open the detailed DCF workbook ↓</a>}
  </div>;
}
