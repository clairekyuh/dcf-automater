import type { ComparableCompany, CompanyData } from "@/lib/company-data";
import { buildOperatingSeries, buildTerminalMix, buildValuationRanges } from "@/lib/dcf-visuals";
import { calculateDcf, type DcfModel } from "@/lib/dcf-engine";
import styles from "./valuation-visuals.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const colors = {
  revenue: "#b8c4b7",
  growth: "#25463a",
  ebitda: "#41651c",
  ebit: "#25463a",
  ufcf: "#b66a3c",
};

type DcfResult = ReturnType<typeof calculateDcf>;

function scaleDomain(values: number[], minimumSpan = 1) {
  const finite = values.filter(Number.isFinite);
  const minimum = Math.min(0, ...finite);
  const maximum = Math.max(minimumSpan, ...finite);
  return { minimum, maximum, span: Math.max(maximum - minimum, minimumSpan) };
}

function OperatingChart({ data, result }: { data: CompanyData; result: DcfResult }) {
  const points = buildOperatingSeries(data, result);
  const revenueQuality = data.revenueData?.quality;
  if (revenueQuality === "conflicting" || revenueQuality === "unavailable") return <article className={styles.chartBlock}>
    <header><div><h3>Revenue and growth</h3><p>Historical and forecast</p></div></header>
    <div className={styles.chartUnavailable}>Revenue history is {revenueQuality}. Review the source data before using this chart.</div>
  </article>;
  const width = 920;
  const height = 320;
  const padding = { left: 62, right: 54, top: 24, bottom: 52 };
  const revenue = scaleDomain(points.map((point) => point.revenue));
  const growthValues = points.map((point) => point.revenueGrowth).filter((value): value is number => value !== null);
  const growth = scaleDomain(growthValues, 10);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + (index + 0.5) * plotWidth / Math.max(points.length, 1);
  const revenueY = (value: number) => padding.top + (revenue.maximum - value) / revenue.span * plotHeight;
  const growthY = (value: number) => padding.top + (growth.maximum - value) / growth.span * plotHeight;
  const baseline = revenueY(0);
  const barWidth = Math.min(42, plotWidth / Math.max(points.length, 1) * 0.48);
  const periodWidth = plotWidth / Math.max(points.length, 1);
  const tooltipWidth = 244;
  const tooltipHeight = 120;
  const growthLine = points
    .map((point, index) => point.revenueGrowth === null ? null : `${x(index)},${growthY(point.revenueGrowth)}`)
    .filter(Boolean)
    .join(" ");
  const forecastStart = points.findIndex((point) => point.period === "forecast");
  const dividerX = forecastStart > 0 ? (x(forecastStart - 1) + x(forecastStart)) / 2 : null;
  const statusLabel = (status: typeof points[number]["revenueStatus"]) => status === "reported" ? "Reported" : status === "consensus" ? "Consensus estimate" : "Model estimate";
  const growthLabel = (growthValue: number | null) => growthValue === null ? "N/A" : `${oneDecimal.format(growthValue)}%`;
  const revenueLabel = (value: number) => `$${oneDecimal.format(value)}M`;
  const sourceLabel = (source: string) => source
    .replace("S&P Global consensus via Stock Analysis", "S&P Global consensus")
    .replace("Nasdaq annual financial statements", "Nasdaq annual financials")
    .replace("Editable model estimate. Not analyst consensus.", "Editable model estimate");
  const interim = data.revenueData?.latestInterim;

  return <article className={styles.chartBlock}>
    <header>
      <div><h3>Revenue and growth</h3><p>Historical and forecast</p></div>
      <div className={styles.legend}>
        <span><i style={{ background: colors.revenue }}/>Reported</span>
        <span><i className={styles.consensusLegend}/>Consensus</span>
        <span><i className={styles.modelLegend}/>Model</span>
        <span><i style={{ background: colors.growth }}/>Growth</span>
      </div>
    </header>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical and forecast revenue with annual growth">
      {[0, 0.5, 1].map((ratio) => {
        const value = revenue.minimum + revenue.span * ratio;
        const y = revenueY(value);
        return <g key={ratio}>
          <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className={styles.grid}/>
          <text x={padding.left - 10} y={y + 4} textAnchor="end">{compact.format(value)}</text>
        </g>;
      })}
      {points.map((point, index) => <g key={`${point.label}-${index}`}>
        <rect
          x={x(index) - barWidth / 2}
          y={Math.min(revenueY(point.revenue), baseline)}
          width={barWidth}
          height={Math.max(1, Math.abs(baseline - revenueY(point.revenue)))}
          className={point.revenueStatus === "reported" ? styles.reportedBar : point.revenueStatus === "consensus" ? styles.consensusBar : styles.modelBar}
        />
        <text x={x(index)} y={height - 19} textAnchor="middle">{point.label}</text>
      </g>)}
      {dividerX !== null && <g>
        <line x1={dividerX} x2={dividerX} y1={padding.top} y2={height - padding.bottom} className={styles.divider}/>
        <text x={dividerX + 7} y={padding.top + 12}>FORECAST</text>
      </g>}
      <polyline points={growthLine} fill="none" stroke={colors.growth} strokeWidth="3"/>
      {points.map((point, index) => point.revenueGrowth === null ? null : <g key={`growth-${point.label}`}>
        <circle cx={x(index)} cy={growthY(point.revenueGrowth)} r="3" fill={colors.growth}/>
      </g>)}
      {points.map((point, index) => {
        const pointX = x(index);
        const targetLeft = index === 0 ? padding.left : pointX - periodWidth / 2;
        const targetRight = index === points.length - 1 ? width - padding.right : pointX + periodWidth / 2;
        const tooltipX = Math.min(width - padding.right - tooltipWidth, Math.max(padding.left, pointX - tooltipWidth / 2));
        const status = statusLabel(point.revenueStatus);
        const source = sourceLabel(point.revenueSource);
        const accessibleLabel = `${point.label}. Full fiscal year ending ${point.fiscalPeriodEnd || "date unavailable"}. Revenue ${revenueLabel(point.revenue)}. Growth ${growthLabel(point.revenueGrowth)}. ${status}. ${source}${point.revenueSourceAsOf ? `. Source updated ${point.revenueSourceAsOf}` : ""}.`;
        return <g key={`revenue-hover-${point.label}`} className={styles.hoverPeriod} tabIndex={0} role="group" aria-label={accessibleLabel}>
          <rect x={targetLeft} y={padding.top} width={Math.max(1, targetRight - targetLeft)} height={height - padding.top - padding.bottom} className={styles.hoverTarget}/>
          <line x1={pointX} x2={pointX} y1={padding.top} y2={height - padding.bottom} className={styles.hoverGuide}/>
          <g className={styles.pointTooltip} transform={`translate(${tooltipX} 12)`}>
            <rect width={tooltipWidth} height={tooltipHeight} rx="3"/>
            <text x="12" y="19" className={styles.tooltipTitle}>{point.label} · {status}</text>
            <text x="12" y="40">Revenue</text><text x={tooltipWidth - 12} y="40" textAnchor="end">{revenueLabel(point.revenue)}</text>
            <text x="12" y="59">Growth</text><text x={tooltipWidth - 12} y="59" textAnchor="end">{growthLabel(point.revenueGrowth)}</text>
            <text x="12" y="78">Source</text><text x={tooltipWidth - 12} y="78" textAnchor="end">{source}</text>
            <text x="12" y="96">Period</text><text x={tooltipWidth - 12} y="96" textAnchor="end">Full year · {point.fiscalPeriodEnd || "N/A"}</text>
            <text x="12" y="114">Updated</text><text x={tooltipWidth - 12} y="114" textAnchor="end">{point.revenueSourceAsOf || "N/A"}</text>
          </g>
        </g>;
      })}
    </svg>
    {revenueQuality === "partial" && <p className={styles.dataNotice}>{data.revenueData?.issues[0] || "Annual revenue history is incomplete."}</p>}
    {interim && <p className={styles.interimResult}><b>Latest interim</b><span>{interim.periodType === "quarter" ? "Quarter" : "Year to date"} ended {interim.periodEnd}: {revenueLabel(interim.revenue)}{interim.comparableRevenue === null ? "" : ` · prior year ${revenueLabel(interim.comparableRevenue)}`}{interim.growth === null ? "" : ` · ${growthLabel(interim.growth)} growth`} · not a full fiscal year</span></p>}
  </article>;
}

function MarginChart({ data, result }: { data: CompanyData; result: DcfResult }) {
  const points = buildOperatingSeries(data, result);
  const width = 920;
  const height = 320;
  const padding = { left: 52, right: 20, top: 24, bottom: 52 };
  const keys = ["ebitdaMargin", "ebitMargin", "ufcfMargin"] as const;
  const values = points.flatMap((point) => keys.map((key) => point[key])).filter((value): value is number => value !== null);
  const domain = scaleDomain(values, 10);
  const x = (index: number) => padding.left + index * (width - padding.left - padding.right) / Math.max(points.length - 1, 1);
  const y = (value: number) => padding.top + (domain.maximum - value) / domain.span * (height - padding.top - padding.bottom);
  const line = (key: typeof keys[number]) => points
    .map((point, index) => point[key] === null ? null : `${x(index)},${y(point[key] as number)}`)
    .filter(Boolean)
    .join(" ");
  const periodWidth = (width - padding.left - padding.right) / Math.max(points.length - 1, 1);
  const tooltipWidth = 176;
  const tooltipHeight = 88;
  const percentLabel = (value: number | null) => value === null ? "N/A" : `${oneDecimal.format(value)}%`;

  return <article className={styles.chartBlock}>
    <header>
      <div><h3>Margins and cash conversion</h3><p>Percent of revenue</p></div>
      <div className={styles.legend}>
        <span><i style={{ background: colors.ebitda }}/>EBITDA</span>
        <span><i style={{ background: colors.ebit }}/>EBIT</span>
        <span><i style={{ background: colors.ufcf }}/>UFCF</span>
      </div>
    </header>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical and forecast EBITDA, EBIT, and unlevered free cash flow margins">
      {[domain.minimum, domain.minimum + domain.span / 2, domain.maximum].map((value) => <g key={value}>
        <line x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} className={styles.grid}/>
        <text x={padding.left - 9} y={y(value) + 4} textAnchor="end">{oneDecimal.format(value)}%</text>
      </g>)}
      {points.map((point, index) => <text key={point.label} x={x(index)} y={height - 19} textAnchor="middle">{point.label}</text>)}
      {keys.map((key) => <polyline key={key} points={line(key)} fill="none" stroke={key === "ebitdaMargin" ? colors.ebitda : key === "ebitMargin" ? colors.ebit : colors.ufcf} strokeWidth="3"/>)}
      {points.flatMap((point, index) => keys.map((key) => point[key] === null ? null : <circle
        key={`${key}-${point.label}`}
        cx={x(index)}
        cy={y(point[key] as number)}
        r="3"
        fill={key === "ebitdaMargin" ? colors.ebitda : key === "ebitMargin" ? colors.ebit : colors.ufcf}
      />))}
      {points.map((point, index) => {
        const pointX = x(index);
        const targetLeft = index === 0 ? padding.left : pointX - periodWidth / 2;
        const targetRight = index === points.length - 1 ? width - padding.right : pointX + periodWidth / 2;
        const tooltipX = Math.min(width - padding.right - tooltipWidth, Math.max(padding.left, pointX - tooltipWidth / 2));
        const periodType = point.period === "actual" ? "Actual" : "Forecast";
        const accessibleLabel = `${point.label}, ${periodType}. EBITDA margin ${percentLabel(point.ebitdaMargin)}, EBIT margin ${percentLabel(point.ebitMargin)}, UFCF margin ${percentLabel(point.ufcfMargin)}.`;
        return <g key={`hover-${point.label}`} className={styles.hoverPeriod} tabIndex={0} role="group" aria-label={accessibleLabel}>
          <rect x={targetLeft} y={padding.top} width={Math.max(1, targetRight - targetLeft)} height={height - padding.top - padding.bottom} className={styles.hoverTarget}/>
          <line x1={pointX} x2={pointX} y1={padding.top} y2={height - padding.bottom} className={styles.hoverGuide}/>
          <g className={styles.pointTooltip} transform={`translate(${tooltipX} 16)`}>
            <rect width={tooltipWidth} height={tooltipHeight} rx="3"/>
            <text x="12" y="19" className={styles.tooltipTitle}>{point.label} · {periodType}</text>
            <text x="12" y="39">EBITDA margin</text><text x={tooltipWidth - 12} y="39" textAnchor="end">{percentLabel(point.ebitdaMargin)}</text>
            <text x="12" y="58">EBIT margin</text><text x={tooltipWidth - 12} y="58" textAnchor="end">{percentLabel(point.ebitMargin)}</text>
            <text x="12" y="77">UFCF margin</text><text x={tooltipWidth - 12} y="77" textAnchor="end">{percentLabel(point.ufcfMargin)}</text>
          </g>
        </g>;
      })}
    </svg>
  </article>;
}

function RangeChart({ data, model }: { data: CompanyData; model: DcfModel }) {
  const ranges = buildValuationRanges(data, model);
  const width = 920;
  const rowHeight = 58;
  const height = 76 + ranges.length * rowHeight;
  const left = 190;
  const right = 60;
  const maximum = Math.max(model.marketPrice, ...ranges.map((item) => item.high), 1) * 1.08;
  const x = (value: number) => left + Math.max(0, value) / maximum * (width - left - right);
  const markerX = x(model.marketPrice);

  return <article className={`${styles.chartBlock} ${styles.rangeWide}`}>
    <header><div><h3>Valuation range</h3><p>DCF and comparable-company methods</p></div></header>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Valuation methods compared with the current share price">
      <line x1={markerX} x2={markerX} y1="18" y2={height - 32} className={styles.currentMarker}/>
      <text x={markerX} y="12" textAnchor="middle">Current {money.format(model.marketPrice)}</text>
      {ranges.map((item, index) => {
        const y = 48 + index * rowHeight;
        return <g key={item.label}>
          <text x={left - 16} y={y + 5} textAnchor="end" className={styles.rangeLabel}>{item.label}</text>
          <line x1={x(item.low)} x2={x(item.high)} y1={y} y2={y} className={item.kind === "comps" ? styles.compRange : styles.dcfRange}/>
          <circle cx={x(item.low)} cy={y} r="4"/>
          <circle cx={x(item.high)} cy={y} r="4"/>
          <text x={x(item.low)} y={y - 11} textAnchor="middle">{money.format(item.low)}</text>
          <text x={x(item.high)} y={y - 11} textAnchor="middle">{money.format(item.high)}</text>
        </g>;
      })}
    </svg>
  </article>;
}

function TerminalDependency({ perpetuity, multiple }: { perpetuity: DcfResult; multiple: DcfResult }) {
  const mixes = buildTerminalMix(perpetuity, multiple);
  return <article className={styles.chartBlock}>
    <header><div><h3>Terminal-value dependence</h3><p>Terminal value as a share of enterprise value</p></div></header>
    <div className={styles.terminalDependency}>
      {mixes.map((item) => {
        const terminalPercent = item.terminalPercent;
        const cappedWidth = terminalPercent === null ? 0 : Math.min(100, Math.max(0, terminalPercent));
        return <div key={item.label}>
          <div><b>{item.label}</b><strong>{terminalPercent === null ? "N/A" : `${oneDecimal.format(terminalPercent)}%`}</strong></div>
          <i><span style={{ width: `${cappedWidth}%` }}/></i>
          {terminalPercent !== null && terminalPercent > 100 && <small>Above 100% because the explicit forecast reduces enterprise value.</small>}
        </div>;
      })}
    </div>
  </article>;
}

function EnterpriseToEquityWaterfall({ model, perpetuity, multiple }: { model: DcfModel; perpetuity: DcfResult; multiple: DcfResult }) {
  const claims = model.shortDebt + model.longDebt + model.preferredInterest;
  const methods = [["Perpetual growth", perpetuity], ["Exit multiple", multiple]] as const;
  const width = 920;
  const rowHeight = 112;
  const left = 150;
  const plotWidth = width - left - 40;
  const maxValue = Math.max(1, ...methods.flatMap(([, result]) => [result.enterpriseValue, result.enterpriseValue + model.cash, result.equityValue]));
  const barWidth = (value: number) => Math.max(1, Math.abs(value) / maxValue * plotWidth);

  return <article className={styles.chartBlock}>
    <header><div><h3>Enterprise to equity value</h3><p>Cash adds value; debt and other claims reduce it</p></div></header>
    <svg viewBox={`0 0 ${width} ${32 + methods.length * rowHeight}`} role="img" aria-label="Enterprise-value-to-equity-value waterfall">
      {methods.map(([label, result], index) => {
        const y = 24 + index * rowHeight;
        const enterprise = Math.max(0, result.enterpriseValue);
        const afterCash = enterprise + model.cash;
        const equity = Math.max(0, afterCash - claims);
        const enterpriseWidth = barWidth(enterprise);
        const cashWidth = barWidth(model.cash);
        const claimsWidth = barWidth(claims);
        const equityWidth = barWidth(equity);
        return <g key={label}>
          <text x={left - 14} y={y + 17} textAnchor="end" className={styles.rangeLabel}>{label}</text>
          <rect x={left} y={y} width={enterpriseWidth} height="22" className={styles.waterfallEnterprise}/>
          <rect x={left + enterpriseWidth} y={y} width={cashWidth} height="22" className={styles.waterfallCash}/>
          <rect x={Math.max(left, left + enterpriseWidth + cashWidth - claimsWidth)} y={y} width={claimsWidth} height="22" className={styles.waterfallClaims}/>
          <line x1={left + equityWidth} x2={left + equityWidth} y1={y - 5} y2={y + 27} className={styles.waterfallEquity}/>
          <text x={left} y={y + 43}>EV {compact.format(enterprise)}</text>
          <text x={left + enterpriseWidth} y={y + 43} textAnchor="middle">+ cash {compact.format(model.cash)}</text>
          <text x={left + enterpriseWidth + cashWidth} y={y + 43} textAnchor="end">− claims {compact.format(claims)}</text>
          <text x={left + equityWidth} y={y + 61} textAnchor="middle">Equity {compact.format(equity)}</text>
        </g>;
      })}
    </svg>
  </article>;
}

function PeerScatter({ data }: { data: CompanyData }) {
  const company = data.comparison?.company;
  const peers = [...(company ? [company] : []), ...(data.comparison?.peers || [])]
    .filter((peer): peer is ComparableCompany & { revenueGrowth: number; evToRevenue: number } => (
      peer.revenueGrowth !== null && Number.isFinite(peer.revenueGrowth)
      && peer.evToRevenue !== null && Number.isFinite(peer.evToRevenue)
      && peer.evToRevenue >= 0
    ));

  if (peers.length < 2) return <article className={styles.chartBlock}>
    <header><div><h3>Peer valuation</h3><p>Insufficient comparable growth and multiple data</p></div></header>
  </article>;

  const width = 920;
  const height = 340;
  const padding = { left: 64, right: 32, top: 26, bottom: 56 };
  const xDomain = scaleDomain(peers.map((peer) => peer.revenueGrowth), 10);
  const yDomain = scaleDomain(peers.map((peer) => peer.evToRevenue), 2);
  const x = (value: number) => padding.left + (value - xDomain.minimum) / xDomain.span * (width - padding.left - padding.right);
  const y = (value: number) => padding.top + (yDomain.maximum - value) / yDomain.span * (height - padding.top - padding.bottom);
  const labelGap = 24;
  const plotBottom = height - padding.bottom;
  const orderedPeers = peers
    .map((peer) => ({ peer, pointX: x(peer.revenueGrowth), pointY: y(peer.evToRevenue) }))
    .sort((first, second) => first.pointY - second.pointY);
  const forwardPositionedPeers = orderedPeers.reduce<Array<(typeof orderedPeers)[number] & { labelY: number }>>((positioned, point) => {
    const previousLabelY = positioned.at(-1)?.labelY ?? padding.top + 8 - labelGap;
    const labelY = Math.max(Math.max(padding.top + 8, point.pointY), previousLabelY + labelGap);
    return [...positioned, { ...point, labelY }];
  }, []);
  const plottedPeers = forwardPositionedPeers.reduceRight<typeof forwardPositionedPeers>((positioned, point) => {
    const nextLabelY = positioned[0]?.labelY ?? plotBottom - 8 + labelGap;
    return [{ ...point, labelY: Math.min(point.labelY, nextLabelY - labelGap) }, ...positioned];
  }, []);
  const tooltipWidth = 190;
  const tooltipHeight = 66;

  return <article className={styles.chartBlock}>
    <header><div><h3>Peer valuation</h3><p>Revenue growth versus EV / revenue</p></div></header>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Comparable-company revenue growth versus enterprise value to revenue">
      <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className={styles.grid}/>
      <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} className={styles.grid}/>
      <text x={width / 2} y={height - 12} textAnchor="middle">Revenue growth</text>
      <text x="18" y={height / 2} textAnchor="middle" transform={`rotate(-90 18 ${height / 2})`}>EV / revenue</text>
      {plottedPeers.map(({ peer, pointX, pointY, labelY }) => {
        const isCompany = peer.symbol === data.company.symbol;
        const placeLeft = pointX > width - padding.right - 120;
        const labelX = pointX + (placeLeft ? -16 : 16);
        const labelAnchor = placeLeft ? "end" : "start";
        return <g key={peer.symbol}>
          <circle cx={pointX} cy={pointY} r={isCompany ? 10 : 7} className={isCompany ? styles.peerCompany : styles.peerPoint}/>
          <line x1={pointX} y1={pointY} x2={labelX + (placeLeft ? 4 : -4)} y2={labelY} className={styles.peerLeader}/>
          <text x={labelX} y={labelY + 4} textAnchor={labelAnchor} className={styles.peerLabel}>{peer.symbol}</text>
        </g>;
      })}
      {plottedPeers.map(({ peer, pointX, pointY, labelY }) => {
        const placeLeft = pointX > width - padding.right - 120;
        const labelX = pointX + (placeLeft ? -16 : 16);
        const hitX = placeLeft ? labelX - 54 : labelX - 5;
        const tooltipX = Math.min(width - padding.right - tooltipWidth, Math.max(padding.left, pointX - tooltipWidth / 2));
        const tooltipY = Math.min(plotBottom - tooltipHeight, Math.max(padding.top, pointY - tooltipHeight - 14));
        const accessibleLabel = `${peer.symbol}. Revenue growth ${oneDecimal.format(peer.revenueGrowth)}%. Enterprise value to revenue ${oneDecimal.format(peer.evToRevenue)} times.`;
        return <g key={`hover-${peer.symbol}`} className={styles.peerHover} tabIndex={0} role="group" aria-label={accessibleLabel}>
          <circle cx={pointX} cy={pointY} r="14" className={styles.peerHitTarget}/>
          <rect x={hitX} y={labelY - 12} width="59" height="24" className={styles.peerHitTarget}/>
          <g className={styles.peerTooltip} transform={`translate(${tooltipX} ${tooltipY})`}>
            <rect width={tooltipWidth} height={tooltipHeight} rx="3"/>
            <text x="12" y="20" className={styles.tooltipTitle}>{peer.symbol}</text>
            <text x="12" y="40">Revenue growth</text><text x={tooltipWidth - 12} y="40" textAnchor="end">{oneDecimal.format(peer.revenueGrowth)}%</text>
            <text x="12" y="57">EV / revenue</text><text x={tooltipWidth - 12} y="57" textAnchor="end">{oneDecimal.format(peer.evToRevenue)}×</text>
          </g>
        </g>;
      })}
    </svg>
  </article>;
}

export default function ValuationVisuals({ data, model, perpetuity, multiple }: {
  data: CompanyData;
  model: DcfModel;
  perpetuity: DcfResult;
  multiple: DcfResult;
}) {
  return <div className={styles.visuals}>
    <div className={styles.coreCharts}>
      <OperatingChart data={data} result={perpetuity}/>
      <MarginChart data={data} result={perpetuity}/>
      <RangeChart data={data} model={model}/>
    </div>
    <div className={styles.additionalCharts}>
      <PeerScatter data={data}/>
      <EnterpriseToEquityWaterfall model={model} perpetuity={perpetuity} multiple={multiple}/>
      <TerminalDependency perpetuity={perpetuity} multiple={multiple}/>
    </div>
  </div>;
}
