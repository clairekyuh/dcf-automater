import type { CompanyData } from "@/lib/company-data";
import { buildOperatingSeries, buildTerminalMix, buildValuationRanges } from "@/lib/dcf-visuals";
import { calculateDcf, type DcfModel } from "@/lib/dcf-engine";
import styles from "./valuation-visuals.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const colors = { revenue: "#b8c4b7", ebitda: "#25463a", ufcf: "#b66a3c", gross: "#41651c", ebit: "#bb7041" };

function OperatingChart({ data, result }: { data: CompanyData; result: ReturnType<typeof calculateDcf> }) {
  const points = buildOperatingSeries(data, result);
  const width = 920;
  const height = 310;
  const pad = { left: 58, right: 20, top: 22, bottom: 50 };
  const values = points.flatMap((point) => [point.revenue, point.ebitda, point.ufcf]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min;
  const plotHeight = height - pad.top - pad.bottom;
  const baseline = pad.top + max / span * plotHeight;
  const x = (index: number) => pad.left + (index + .5) * (width - pad.left - pad.right) / Math.max(points.length, 1);
  const y = (value: number) => pad.top + (max - value) / span * plotHeight;
  const barWidth = Math.min(42, (width - pad.left - pad.right) / Math.max(points.length, 1) * .46);
  const line = (key: "ebitda" | "ufcf") => points.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");
  const forecastStart = points.findIndex((point) => point.period === "forecast");
  const dividerX = forecastStart > 0 ? (x(forecastStart - 1) + x(forecastStart)) / 2 : null;
  return <article className={styles.chartBlock}>
    <header><div><h3>Operating forecast</h3><p>USD millions</p></div><div className={styles.legend}><span><i style={{ background: colors.revenue }}/>Revenue</span><span><i style={{ background: colors.ebitda }}/>EBITDA</span><span><i style={{ background: colors.ufcf }}/>UFCF</span></div></header>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical and forecast revenue, EBITDA, and unlevered free cash flow">
      {[0, .5, 1].map((ratio) => { const value = min + span * ratio; const yy = y(value); return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className={styles.grid}/><text x={pad.left - 10} y={yy + 4} textAnchor="end">{compact.format(value)}</text></g>; })}
      {points.map((point, index) => <g key={`${point.label}-${index}`}><rect x={x(index) - barWidth / 2} y={Math.min(y(point.revenue), baseline)} width={barWidth} height={Math.max(1, Math.abs(baseline - y(point.revenue)))} fill={colors.revenue}/><text x={x(index)} y={height - 20} textAnchor="middle">{point.label}</text></g>)}
      {dividerX !== null && <g><line x1={dividerX} x2={dividerX} y1={pad.top} y2={height - pad.bottom} className={styles.divider}/><text x={dividerX + 7} y={pad.top + 12}>FORECAST</text></g>}
      <polyline points={line("ebitda")} fill="none" stroke={colors.ebitda} strokeWidth="3"/>
      <polyline points={line("ufcf")} fill="none" stroke={colors.ufcf} strokeWidth="3"/>
      {points.flatMap((point, index) => (["ebitda", "ufcf"] as const).map((key) => <circle key={`${key}-${index}`} cx={x(index)} cy={y(point[key])} r="3" fill={colors[key]}/>))}
    </svg>
  </article>;
}

function RangeChart({ data, model }: { data: CompanyData; model: DcfModel }) {
  const ranges = buildValuationRanges(data, model);
  const width = 920;
  const rowHeight = 56;
  const height = 50 + ranges.length * rowHeight;
  const left = 170;
  const right = 60;
  const max = Math.max(model.marketPrice, ...ranges.map((item) => item.high), 1) * 1.08;
  const x = (value: number) => left + Math.max(0, value) / max * (width - left - right);
  return <article className={styles.chartBlock}>
    <header><div><h3>Valuation ranges</h3><p>DCF sensitivities and market reference</p></div></header>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Valuation range comparison">
      {ranges.map((item, index) => { const yy = 34 + index * rowHeight; return <g key={item.label}><text x={left - 14} y={yy + 5} textAnchor="end" className={styles.rangeLabel}>{item.label}</text><line x1={x(item.low)} x2={x(item.high)} y1={yy} y2={yy} className={item.kind === "market" ? styles.marketRange : item.kind === "comps" ? styles.compRange : styles.dcfRange}/><circle cx={x(item.low)} cy={yy} r="4"/><circle cx={x(item.high)} cy={yy} r="4"/><text x={x(item.low)} y={yy - 10} textAnchor="middle">{money.format(item.low)}</text><text x={x(item.high)} y={yy - 10} textAnchor="middle">{money.format(item.high)}</text>{item.current !== undefined && <g><line x1={x(item.current)} x2={x(item.current)} y1={yy - 15} y2={yy + 15} className={styles.currentMarker}/><text x={x(item.current)} y={yy + 29} textAnchor="middle">Current {money.format(item.current)}</text></g>}</g>; })}
    </svg>
  </article>;
}

function MarginChart({ data, result }: { data: CompanyData; result: ReturnType<typeof calculateDcf> }) {
  const points = buildOperatingSeries(data, result);
  const width = 920;
  const height = 280;
  const pad = { left: 52, right: 20, top: 20, bottom: 48 };
  const values = points.flatMap((point) => [point.grossMargin, point.ebitMargin]).filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(0, ...values);
  const max = Math.max(10, ...values);
  const x = (index: number) => pad.left + index * (width - pad.left - pad.right) / Math.max(points.length - 1, 1);
  const y = (value: number) => pad.top + (max - value) / Math.max(max - min, 1) * (height - pad.top - pad.bottom);
  const line = (key: "grossMargin" | "ebitMargin") => points.filter((point) => point[key] !== null).map((point) => `${x(points.indexOf(point))},${y(point[key] as number)}`).join(" ");
  return <article className={styles.chartBlock}><header><div><h3>Margins</h3><p>Historical and forecast</p></div><div className={styles.legend}><span><i style={{ background: colors.gross }}/>Gross margin</span><span><i style={{ background: colors.ebit }}/>EBIT margin</span></div></header><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical and forecast gross margin and EBIT margin"><line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className={styles.grid}/>{points.map((point, index) => <text key={point.label} x={x(index)} y={height - 18} textAnchor="middle">{point.label}</text>)}<polyline points={line("grossMargin")} fill="none" stroke={colors.gross} strokeWidth="3"/><polyline points={line("ebitMargin")} fill="none" stroke={colors.ebit} strokeWidth="3"/>{points.flatMap((point, index) => (["grossMargin", "ebitMargin"] as const).map((key) => point[key] === null ? null : <circle key={`${key}-${index}`} cx={x(index)} cy={y(point[key] as number)} r="3" fill={key === "grossMargin" ? colors.gross : colors.ebit}/>))}</svg></article>;
}

function TerminalChart({ perpetuity, multiple }: { perpetuity: ReturnType<typeof calculateDcf>; multiple: ReturnType<typeof calculateDcf> }) {
  const mixes = buildTerminalMix(perpetuity, multiple);
  return <article className={styles.chartBlock}><header><div><h3>Enterprise value composition</h3><p>Present value of forecast cash flow and terminal value</p></div></header><div className={styles.mixList}>{mixes.map((item) => <div key={item.label}><div><b>{item.label}</b><span>{item.terminalPercent === null ? "Signed values" : `${fmt.format(item.terminalPercent)}% from terminal value`}</span></div>{item.terminalPercent === null ? <div className={styles.unavailable}>Forecast {compact.format(item.forecastValue)} + terminal {compact.format(item.terminalValue)}</div> : <div className={styles.mixBar}><i style={{ width: `${item.forecastPercent}%` }}/><em style={{ width: `${item.terminalPercent}%` }}/></div>}</div>)}</div></article>;
}

function BridgeChart({ model, perpetuity, multiple }: { model: DcfModel; perpetuity: ReturnType<typeof calculateDcf>; multiple: ReturnType<typeof calculateDcf> }) {
  const claims = model.shortDebt + model.longDebt + model.preferredInterest;
  const rows = [["Perpetual growth", perpetuity], ["Exit multiple", multiple]] as const;
  return <article className={styles.chartBlock}><header><div><h3>Enterprise to equity value</h3><p>USD millions</p></div></header><div className={styles.bridgeTable}><div><span>Method</span><span>Enterprise value</span><span>Cash</span><span>Debt and other claims</span><span>Equity value</span></div>{rows.map(([label, result]) => <div key={label}><b>{label}</b><span>{result.valid ? compact.format(result.enterpriseValue) : "N/A"}</span><span>{compact.format(model.cash)}</span><span>{compact.format(claims)}</span><strong>{result.valid ? compact.format(result.equityValue) : "N/A"}</strong></div>)}</div></article>;
}

function PeerChart({ data }: { data: CompanyData }) {
  const peers = (data.comparison?.peers || []).filter((peer) => peer.evToEbitda !== null && Number.isFinite(peer.evToEbitda));
  if (!peers.length) return <article className={styles.chartBlock}><header><div><h3>Peer EV / EBITDA</h3><p>No comparable multiple data available</p></div></header></article>;
  const max = Math.max(...peers.map((peer) => peer.evToEbitda || 0), 1);
  return <article className={styles.chartBlock}><header><div><h3>Peer EV / EBITDA</h3><p>Latest available financials</p></div></header><div className={styles.peerBars}>{peers.map((peer) => <div key={peer.symbol}><b>{peer.symbol}</b><i><span style={{ width: `${Math.max(0, peer.evToEbitda || 0) / max * 100}%` }}/></i><strong>{fmt.format(peer.evToEbitda || 0)}×</strong></div>)}</div></article>;
}

export default function ValuationVisuals({ data, model, perpetuity, multiple }: { data: CompanyData; model: DcfModel; perpetuity: ReturnType<typeof calculateDcf>; multiple: ReturnType<typeof calculateDcf> }) {
  return <div className={styles.visuals}>
    <div className={styles.primary}><OperatingChart data={data} result={perpetuity}/><RangeChart data={data} model={model}/></div>
    <details className={styles.more}><summary>More charts</summary><div><MarginChart data={data} result={perpetuity}/><TerminalChart perpetuity={perpetuity} multiple={multiple}/><BridgeChart model={model} perpetuity={perpetuity} multiple={multiple}/><PeerChart data={data}/></div></details>
  </div>;
}
