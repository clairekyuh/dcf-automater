import type { CompanyData } from "@/lib/company-data";
import { calculateDcf, calculateWacc, type DcfModel } from "@/lib/dcf-engine";
import Link from "next/link";
import styles from "./dcf-dashboard.module.css";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const pct2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export type AssumptionTarget = "wacc" | "terminal-growth" | "exit-multiple" | "valuation-date";

function briefDescription(description: string) {
  const clean = description.trim();
  if (!clean) return "A factual company description was not available from Nasdaq or the latest SEC filing.";
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const brief = sentences.slice(0, 2).join(" ").trim();
  return brief.length > 360 ? `${brief.slice(0, 357).trimEnd()}…` : brief;
}

function priceMovement(value: number, valid: boolean, marketPrice: number) {
  if (!valid || marketPrice <= 0) return { label: "Comparison unavailable", positive: null };
  const movement = (value / marketPrice - 1) * 100;
  return {
    label: `${movement >= 0 ? "Upside" : "Downside"} ${fmt.format(Math.abs(movement))}%`,
    positive: movement >= 0,
  };
}

function forecastPeriod(valuationDate: string) {
  const start = new Date(`${valuationDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "Five years";
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 5);
  const format = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
  return `${format.format(start)}–${format.format(end)}`;
}

export default function OutputScreen({
  data,
  model,
  perpetuity,
  multiple,
  financialUnsupported,
  onOpenAssumption,
}: {
  data: CompanyData;
  model: DcfModel;
  perpetuity: ReturnType<typeof calculateDcf>;
  multiple: ReturnType<typeof calculateDcf>;
  financialUnsupported: boolean;
  onOpenAssumption: (target: AssumptionTarget) => void;
}) {
  const selectedWacc = calculateWacc(model).selectedWacc;
  const perpetuityMove = priceMovement(perpetuity.perShare, perpetuity.valid, model.marketPrice);
  const multipleMove = priceMovement(multiple.perShare, multiple.valid, model.marketPrice);
  return <div className={styles.summary}>
    <div className={styles.companyRow}>
      <div className={styles.companyIdentity}>
        <p>{data.company.exchange} · {data.company.symbol}</p>
        <h2>{data.company.name}</h2>
        <span>{briefDescription(data.company.description)}</span>
        <Link href={`/company-analysis?symbol=${encodeURIComponent(data.company.symbol)}`}>Company analysis →</Link>
      </div>
      <div className={styles.marketPrice}>
        <span>Current market price</span>
        <strong>{usd.format(model.marketPrice)}</strong>
        <small>{data.market.priceDate ? `Nasdaq close · ${data.market.priceDate}` : data.market.priceBasis || "Editable price input"}</small>
      </div>
    </div>

    {financialUnsupported ? <div className={styles.sectorLimit}>
      <h3>Standard unlevered DCF is not appropriate</h3>
      <p>Use a bank- or insurer-specific framework built around regulatory capital, asset quality, funding economics, tangible book value, and return on equity.</p>
    </div> : <>
      <div className={styles.valuationMethods}>
        <article>
          <span>Perpetual growth</span>
          <strong>{perpetuity.valid ? usd.format(perpetuity.perShare) : "N/A"}</strong>
          <small className={perpetuityMove.positive === true ? styles.positive : perpetuityMove.positive === false ? styles.negative : ""}>{perpetuity.valid ? perpetuityMove.label : perpetuity.invalidReason}</small>
        </article>
        <article>
          <span>Exit multiple</span>
          <strong>{multiple.valid ? usd.format(multiple.perShare) : "N/A"}</strong>
          <small className={multipleMove.positive === true ? styles.positive : multipleMove.positive === false ? styles.negative : ""}>{multiple.valid ? multipleMove.label : multiple.invalidReason}</small>
        </article>
      </div>

      <div className={styles.assumptions} aria-label="Key DCF assumptions">
        <button type="button" onClick={() => onOpenAssumption("wacc")} aria-label="Edit WACC inputs">
          <span>WACC</span><b>{pct2.format(selectedWacc)}%</b>
        </button>
        <button type="button" onClick={() => onOpenAssumption("terminal-growth")} aria-label="Edit terminal growth">
          <span>Long-term growth</span><b>{fmt.format(model.terminalGrowth)}%</b>
        </button>
        <button type="button" onClick={() => onOpenAssumption("exit-multiple")} aria-label="Edit exit EBITDA multiple">
          <span>Exit multiple</span><b>{fmt.format(model.exitMultiple)}×</b>
        </button>
        <button type="button" onClick={() => onOpenAssumption("valuation-date")} aria-label="Edit forecast period">
          <span>Forecast period</span><b>{forecastPeriod(model.valuationDate)}</b>
        </button>
      </div>
    </>}
  </div>;
}
