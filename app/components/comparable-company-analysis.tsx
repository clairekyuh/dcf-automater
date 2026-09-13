"use client";

import { buildBusinessComparison } from "@/lib/business-comparison";
import type { CompanyData, ComparableCompany } from "@/lib/company-data";
import { isStandardDcfUnsupported } from "@/lib/dcf-engine";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const validValues = (values: Array<number | null>) => values.filter((value): value is number => value !== null && Number.isFinite(value));
const median = (values: Array<number | null>) => {
  const sorted = validValues(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mean = (values: Array<number | null>) => {
  const valid = validValues(values);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

function businessFocus(company: Pick<ComparableCompany, "description" | "industry" | "sector" | "businessModel">) {
  if (company.businessModel) return company.businessModel;
  const text = `${company.industry} ${company.sector} ${company.description}`;
  const rules = [
    [/electronic design automation|semiconductor ip/i, "Chip-design software and IP"],
    [/cybersecurity|security software|network security/i, "Cybersecurity software"],
    [/ai[- ]native|ai cloud|gpu.{0,30}(cloud|compute)/i, "AI-native GPU cloud infrastructure"],
    [/cloud infrastructure|data center|compute.*cloud|cloud.*compute/i, "Cloud and compute infrastructure"],
    [/semiconductor/i, "Semiconductor products and IP"],
    [/software|saas|application/i, "Enterprise software and workflows"],
    [/bank|financial services/i, "Banking and financial services"],
    [/insurance/i, "Insurance underwriting"],
    [/biotech|pharma|therapeutic/i, "Medicines and life-science innovation"],
    [/automotive|vehicle|automobile/i, "Vehicles and mobility"],
    [/retail|consumer|restaurant/i, "Consumer products and distribution"],
    [/oil|gas|energy/i, "Energy production and infrastructure"],
    [/utility/i, "Regulated utility services"],
    [/industrial|manufactur|aerospace|defense/i, "Industrial products and services"],
  ] as const;
  return rules.find(([match]) => match.test(text))?.[1] || company.industry || company.sector || "Diversified operations";
}

export default function ComparableCompanyAnalysis({ data }: { data: CompanyData }) {
  const comparison = data.comparison;
  const company: ComparableCompany = comparison?.company || {
    symbol: data.company.symbol, name: data.company.name, description: data.company.description,
    sector: data.company.sector, industry: data.company.industry, marketCap: data.market.marketCap,
    revenueGrowth: data.metrics.revenueGrowth, operatingMargin: data.metrics.ebitMargin,
    evToRevenue: null, evToEbitda: null, pe: null,
  };
  const peers = comparison?.peers || [];
  const financialCompany = isStandardDcfUnsupported(data.company);
  const peerMetric = (key: keyof Pick<ComparableCompany, "marketCap" | "revenueGrowth" | "operatingMargin" | "evToRevenue" | "evToEbitda" | "pe">) => median(peers.map((peer) => peer[key]));
  const peerAverage = (key: keyof Pick<ComparableCompany, "marketCap" | "revenueGrowth" | "operatingMargin" | "evToRevenue" | "evToEbitda" | "pe">) => mean(peers.map((peer) => peer[key]));
  const metrics = { growth: peerMetric("revenueGrowth"), margin: peerMetric("operatingMargin"), marketCap: peerMetric("marketCap"), multiple: peerMetric("evToEbitda"), revenueMultiple: peerMetric("evToRevenue"), pe: peerMetric("pe") };
  const means = { growth: peerAverage("revenueGrowth"), margin: peerAverage("operatingMargin"), marketCap: peerAverage("marketCap"), multiple: peerAverage("evToEbitda"), revenueMultiple: peerAverage("evToRevenue"), pe: peerAverage("pe") };
  const formatMetric = (value: number | null, suffix = "×") => value === null || !Number.isFinite(value) ? "—" : `${fmt.format(value)}${suffix}`;
  const formatCap = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : value >= 1000 ? `$${fmt.format(value / 1000)}B` : `$${fmt.format(value)}M`;
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
    financialCompany ? { label: "P / E", value: formatMetric(company.pe), detail: difference(company.pe, metrics.pe, "above", "below", "×") } : { label: "EV / EBITDA", value: formatMetric(company.evToEbitda), detail: difference(company.evToEbitda, metrics.multiple, "above", "below", "×") },
  ];
  const detailed = buildBusinessComparison({ company, peers, nicheLabel: comparison?.nicheLabel, capexPercentRevenue: data.metrics.capexPercentRevenue, operatingMargin: company.operatingMargin, peerMedianMargin: metrics.margin });
  const rows = peers.length ? [company, ...peers] : [company];
  const fitLabel = (fit: ComparableCompany["peerFit"]) => fit === "direct" ? "direct fit" : fit === "close" ? "close fit" : fit === "adjacent" ? "adjacent" : "";

  return <section className="analysis-section comps-analysis" id="competitors">
    <div className="analysis-heading"><div><h2>Comparable-company analysis</h2></div><p>Peers are selected from the company’s business model, products, customers, and capital requirements—not only its reported industry label.</p></div>
    <div className="peer-selection-note"><div><span>SELECTED BUSINESS NICHE</span><strong>{comparison?.nicheLabel || businessFocus(company)}</strong></div><p>{comparison?.selectionBasis || "The closest available public companies are selected using the company description, products, customers, and operating model."}</p>{Boolean(comparison?.operatingCompetitors?.length) && <small>Broader operating competitors—not primary valuation peers: {comparison?.operatingCompetitors?.join(" · ")}</small>}</div>
    <div className="business-review">
      <article><span>WHAT THE COMPANY DOES</span><h3>{comparison?.nicheLabel || businessFocus(company)}</h3><p>{company.description || data.company.description}</p></article>
      <article className="business-difference-card"><span>HOW THE BUSINESS DIFFERS</span><h3>{detailed.title}</h3><p>{detailed.summary}</p><div className="business-difference-grid">{detailed.dimensions.map((dimension) => <div key={dimension.label}><b>{dimension.label}</b><p>{dimension.detail}</p></div>)}</div>{detailed.peerModels.length > 0 && <div className="peer-model-list"><b>PEER-BY-PEER BUSINESS MODEL</b><div>{detailed.peerModels.map((peer) => <section key={peer.symbol}><strong>{peer.symbol} · {peer.name}</strong><p>{peer.detail}</p></section>)}</div></div>}<small>Comparison lens: {detailed.ruleTitle}. Verify segment revenue, customer concentration, and capital allocation before applying a peer multiple.</small></article>
    </div>
    <div className="peer-summary"><div><span>NICHE GROWTH BENCHMARK</span><strong>{comparison?.industryGrowthRate == null ? "—" : `${fmt.format(comparison.industryGrowthRate)}%`}</strong><small>Median recent peer revenue growth</small></div><div><span>{financialCompany ? "PEER MEDIAN P / E" : "PEER MEDIAN EV / EBITDA"}</span><strong>{formatMetric(financialCompany ? metrics.pe : metrics.multiple)}</strong><small>{financialCompany ? "Use with book value, ROE, capital, and credit quality" : "Reference for the exit-multiple method"}</small></div><div><span>SELECTED PEER GROUP</span><strong>{(comparison?.selectedPeerSymbols || peers.map((peer) => peer.symbol)).join(" · ") || "Unavailable"}</strong><small>Narrowed by products, customers, and operating model</small></div></div>
    <div className="peer-table-wrap table-scroll"><table className="peer-table"><thead><tr><th>Company</th><th>Business focus</th><th>Market cap</th><th>Revenue growth</th><th>Operating margin</th><th>EV / Revenue</th><th>EV / EBITDA</th><th>P / E</th></tr></thead><tbody>
      {rows.map((peer, index) => <tr className={index === 0 ? "focus-company" : ""} key={peer.symbol}><td><b>{peer.symbol}</b><span>{peer.name}</span>{index === 0 && <em>FOCUS COMPANY</em>}</td><td className="business-focus-cell"><b>{index === 0 ? comparison?.nicheLabel || businessFocus(peer) : businessFocus(peer)}</b>{index > 0 && fitLabel(peer.peerFit) && <span className="peer-fit-indicator">Peer fit: {fitLabel(peer.peerFit)}</span>}{peer.peerRationale && <small>{peer.peerRationale}</small>}</td><td>{formatCap(peer.marketCap)}</td><td>{formatMetric(peer.revenueGrowth, "%")}</td><td>{formatMetric(peer.operatingMargin, "%")}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToRevenue)}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToEbitda)}</td><td>{formatMetric(peer.pe)}</td></tr>)}
      {peers.length > 0 && <tr className="peer-median"><td><b>PEER MEDIAN</b><span>{peers.length} returned companies</span></td><td>—</td><td>{formatCap(metrics.marketCap)}</td><td>{formatMetric(metrics.growth, "%")}</td><td>{formatMetric(metrics.margin, "%")}</td><td>{financialCompany ? "n/m" : formatMetric(metrics.revenueMultiple)}</td><td>{financialCompany ? "n/m" : formatMetric(metrics.multiple)}</td><td>{formatMetric(metrics.pe)}</td></tr>}
      {peers.length > 0 && <tr className="peer-mean"><td><b>PEER MEAN</b><span>Arithmetic average</span></td><td>—</td><td>{formatCap(means.marketCap)}</td><td>{formatMetric(means.growth, "%")}</td><td>{formatMetric(means.margin, "%")}</td><td>{financialCompany ? "n/m" : formatMetric(means.revenueMultiple)}</td><td>{financialCompany ? "n/m" : formatMetric(means.multiple)}</td><td>{formatMetric(means.pe)}</td></tr>}
    </tbody></table></div>
    {!peers.length && <div className="peer-empty">Comparable ratios were not returned for this request.</div>}
    <h3 className="difference-title">How {company.symbol} differs from the peer median</h3><div className="difference-grid">{insights.map((insight) => <article key={insight.label}><span>{insight.label}</span><strong>{insight.value}</strong><p>{insight.detail}</p></article>)}</div>
    <p className="peer-disclaimer">Peer mean is the arithmetic average and can be distorted by outliers; peer median is usually more resistant to extremes. Multiples and margins use current market capitalization against the latest displayed annual financials—not LTM or forward consensus.</p>
  </section>;
}
