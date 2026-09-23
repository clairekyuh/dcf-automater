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
  const metrics = { growth: peerMetric("revenueGrowth"), margin: peerMetric("operatingMargin"), marketCap: peerMetric("marketCap"), multiple: peerMetric("evToEbitda"), revenueMultiple: peerMetric("evToRevenue"), pe: peerMetric("pe") };
  const compKeys = ["marketCap", "enterpriseValue", "evToRevenueLtm", "evToRevenueNtm", "evToEbitdaLtm", "evToEbitdaNtm", "evToEbitLtm", "evToEbitNtm"] as const;
  const compMedian = Object.fromEntries(compKeys.map((key) => [key, median(peers.map((peer) => peer[key] ?? null))])) as Record<(typeof compKeys)[number], number | null>;
  const compMean = Object.fromEntries(compKeys.map((key) => [key, mean(peers.map((peer) => peer[key] ?? null))])) as Record<(typeof compKeys)[number], number | null>;
  const formatMetric = (value: number | null, suffix = "×") => value === null || !Number.isFinite(value) ? "N/A" : `${fmt.format(value)}${suffix}`;
  const formatCap = (value: number | null) => value === null || !Number.isFinite(value) ? "N/A" : value >= 1000 ? `$${fmt.format(value / 1000)}B` : `$${fmt.format(value)}M`;
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
  const rowBusiness = (peer: ComparableCompany, index: number) => {
    if (index === 0) return comparison?.nicheLabel || businessFocus(peer);
    const rationaleLead = peer.peerRationale?.match(/^[^.!?]+[.!?]/)?.[0];
    return rationaleLead || businessFocus(peer);
  };

  return <section className="analysis-section comps-analysis" id="competitors">
    <div className="analysis-heading"><div><h2>Comparable companies</h2></div><p>{comparison?.nicheLabel || businessFocus(company)}</p></div>
    <div className="peer-summary"><div><span>PEER MEDIAN GROWTH</span><strong>{comparison?.industryGrowthRate == null ? "N/A" : `${fmt.format(comparison.industryGrowthRate)}%`}</strong></div><div><span>{financialCompany ? "PEER MEDIAN P / E" : "PEER MEDIAN EV / EBITDA"}</span><strong>{formatMetric(financialCompany ? metrics.pe : metrics.multiple)}</strong></div></div>
    <div className="peer-table-wrap table-scroll"><table className="peer-table peer-valuation-table"><thead><tr><th rowSpan={2}>Company</th><th rowSpan={2}>Business focus</th><th rowSpan={2}>Market cap</th><th rowSpan={2}>TEV</th><th colSpan={2}>EV / Revenue</th><th colSpan={2}>EV / EBITDA</th><th colSpan={2}>EV / EBIT</th></tr><tr><th>LTM</th><th>NTM</th><th>LTM</th><th>NTM</th><th>LTM</th><th>NTM</th></tr></thead><tbody>
      {rows.map((peer, index) => <tr className={index === 0 ? "focus-company" : ""} key={peer.symbol}><td><b>{peer.symbol}</b><span>{peer.name}</span>{index === 0 && <em>FOCUS COMPANY</em>}</td><td className="business-focus-cell"><b>{rowBusiness(peer, index)}</b>{index > 0 && fitLabel(peer.peerFit) && <span className="peer-fit-indicator">{fitLabel(peer.peerFit)}</span>}{index > 0 && peer.peerRationale && <details className="peer-rationale"><summary>Similarities</summary><small>{peer.peerRationale}</small></details>}</td><td>{formatCap(peer.marketCap)}</td><td>{formatCap(peer.enterpriseValue ?? null)}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToRevenueLtm ?? null)}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToRevenueNtm ?? null)}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToEbitdaLtm ?? null)}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToEbitdaNtm ?? null)}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToEbitLtm ?? null)}</td><td>{financialCompany ? "n/m" : formatMetric(peer.evToEbitNtm ?? null)}</td></tr>)}
      {peers.length > 0 && <tr className="peer-median"><td><b>MEDIAN</b><span>{peers.length} peers</span></td><td></td><td>{formatCap(compMedian.marketCap)}</td><td>{formatCap(compMedian.enterpriseValue)}</td><td>{financialCompany ? "n/m" : formatMetric(compMedian.evToRevenueLtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMedian.evToRevenueNtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMedian.evToEbitdaLtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMedian.evToEbitdaNtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMedian.evToEbitLtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMedian.evToEbitNtm)}</td></tr>}
      {peers.length > 0 && <tr className="peer-mean"><td><b>AVERAGE</b><span>{peers.length} peers</span></td><td></td><td>{formatCap(compMean.marketCap)}</td><td>{formatCap(compMean.enterpriseValue)}</td><td>{financialCompany ? "n/m" : formatMetric(compMean.evToRevenueLtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMean.evToRevenueNtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMean.evToEbitdaLtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMean.evToEbitdaNtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMean.evToEbitLtm)}</td><td>{financialCompany ? "n/m" : formatMetric(compMean.evToEbitNtm)}</td></tr>}
    </tbody></table></div>
    {!peers.length && <div className="peer-empty">Comparable ratios were not returned for this request.</div>}
    <details className="peer-details"><summary>Business comparison</summary><div className="business-review"><article className="business-difference-card"><h3>{detailed.title}</h3><p>{detailed.summary}</p><div className="business-difference-grid">{detailed.dimensions.map((dimension) => <div key={dimension.label}><b>{dimension.label}</b><p>{dimension.detail}</p></div>)}</div>{detailed.peerModels.length > 0 && <div className="peer-model-list"><b>Peers</b><div>{detailed.peerModels.map((peer) => <section key={peer.symbol}><strong>{peer.symbol}: {peer.name}</strong><p>{peer.detail}</p></section>)}</div></div>}</article></div><h3 className="difference-title">Financial comparison</h3><div className="difference-grid">{insights.map((insight) => <article key={insight.label}><span>{insight.label}</span><strong>{insight.value}</strong><p>{insight.detail}</p></article>)}</div>{Boolean(comparison?.operatingCompetitors?.length) && <p className="peer-disclaimer">Other competitors: {comparison?.operatingCompetitors?.join(", ")}</p>}</details>
    <details className="peer-methodology"><summary>Data notes</summary><p>{comparison?.selectionBasis || "Peers are selected using products, customers, and operating model."}</p><p>LTM uses the latest four reported quarters when available. If a provider omits quarterly statements, the latest reported fiscal year is used and identified here. NTM revenue uses available consensus. NTM EBIT and EBITDA hold the LTM margin constant. TEV equals market capitalization plus debt less cash.</p>{rows.some((peer) => peer.ltmBasis?.startsWith("Latest reported fiscal year")) && <p>Fiscal-year fallback: {rows.filter((peer) => peer.ltmBasis?.startsWith("Latest reported fiscal year")).map((peer) => `${peer.symbol} (${peer.ltmBasis})`).join("; ")}.</p>}</details>
  </section>;
}
