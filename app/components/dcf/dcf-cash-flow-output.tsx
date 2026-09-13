import { DcfRowLabel } from "@/app/components/dcf/defined-term";
import { calculateDcf, fiscalPeriodLabel } from "@/lib/dcf-engine";
import styles from "./dcf-dashboard.module.css";

type DcfResult = ReturnType<typeof calculateDcf>;
type OutputRow = {
  label: string;
  values: number[];
  yearFive: number;
  format: (value: number) => string;
  emphasis?: "ratio" | "total";
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function moneyCell(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value < 0 ? `(${money.format(Math.abs(value))})` : money.format(value);
}

function percentCell(value: number) {
  return Number.isFinite(value) ? `${percent.format(value)}%` : "—";
}

function factorCell(value: number) {
  return Number.isFinite(value) ? value.toFixed(value < 1 ? 3 : 2) : "—";
}

export default function DcfCashFlowOutput({ result }: { result: DcfResult }) {
  const atYearFive = (select: (year: DcfResult["years"][number]) => number) =>
    select(result.years[4]) * result.firstYearWeight + select(result.years[5]) * result.lastYearWeight;
  const revenue = atYearFive((year) => year.revenue);
  const ebitda = atYearFive((year) => year.ebitda);
  const rows: OutputRow[] = [
    { label: "Revenue", values: result.years.map((year) => year.revenue), yearFive: revenue, format: moneyCell },
    { label: "EBITDA", values: result.years.map((year) => year.ebitda), yearFive: ebitda, format: moneyCell },
    { label: "EBITDA margin", values: result.years.map((year) => year.revenue ? year.ebitda / year.revenue * 100 : 0), yearFive: revenue ? ebitda / revenue * 100 : 0, format: percentCell, emphasis: "ratio" },
    { label: "EBIT", values: result.years.map((year) => year.ebit), yearFive: atYearFive((year) => year.ebit), format: moneyCell },
    { label: "Less: cash tax on EBIT", values: result.years.map((year) => -year.tax), yearFive: -atYearFive((year) => year.tax), format: moneyCell },
    { label: "Plus: D&A", values: result.years.map((year) => year.depreciation), yearFive: atYearFive((year) => year.depreciation), format: moneyCell },
    { label: "Less: capex", values: result.years.map((year) => -year.capex), yearFive: -atYearFive((year) => year.capex), format: moneyCell },
    { label: "Less: change in NWC", values: result.years.map((year) => -year.changeNwc), yearFive: -atYearFive((year) => year.changeNwc), format: moneyCell },
    { label: "Unlevered free cash flow", values: result.years.map((year) => year.fcf), yearFive: result.terminalForecastFcf, format: moneyCell, emphasis: "total" },
    { label: "Included portion of fiscal year", values: result.years.map((year) => year.weight * 100), yearFive: 100, format: percentCell, emphasis: "ratio" },
    { label: "Mid-year discount period", values: result.years.map((year) => year.discountPeriod), yearFive: 5, format: factorCell, emphasis: "ratio" },
    { label: "Discount factor", values: result.years.map((year) => year.discountFactor), yearFive: 1 / Math.pow(1 + result.waccPercent / 100, 5), format: factorCell, emphasis: "ratio" },
    { label: "Present value of UFCF", values: result.years.map((year) => year.pv), yearFive: result.pvForecast, format: moneyCell, emphasis: "total" },
  ];

  return <>
    <div className="formula-bar"><b>fx</b><code>UFCF = EBIT × (1 − Tax Rate) + D&amp;A − Capex − ΔNWC + Δ Deferred Tax + Other Non-Cash Adjustments</code></div>
    <div className={`model-table-wrap ${styles.cashFlowTable}`}>
      <table className="model-table">
        <thead><tr><th>Line item</th>{result.years.map((year) => <th key={year.periodEnd}>{fiscalPeriodLabel(year.periodEnd)} E</th>)}<th>Year 5 / total</th></tr></thead>
        <tbody>{rows.map((row) => <tr className={row.emphasis === "total" ? "total" : row.emphasis === "ratio" ? "percent-row" : ""} key={row.label}><td><DcfRowLabel label={row.label}/></td>{row.values.map((value, index) => <td key={`${row.label}-${index}`}>{row.format(value)}</td>)}<td>{row.format(row.yearFive)}</td></tr>)}</tbody>
      </table>
    </div>
  </>;
}
