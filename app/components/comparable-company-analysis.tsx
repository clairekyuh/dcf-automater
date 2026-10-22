"use client";

import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { observationStale } from "@/lib/financial-components";
import { peerExitBenchmark } from "@/lib/comparable-metrics";
import { apiErrorMessage } from "@/lib/client/api-error";
import { readManualPeers, saveManualPeers, withManualPeers } from "@/lib/client/company-storage";
import { normalizeTicker } from "@/lib/ticker";
import { createPortal } from "react-dom";
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

function MultipleNote({ children, detail, extreme = false }: { children: ReactNode; detail: string; extreme?: boolean }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
    const spaceBelow = window.innerHeight - rect.bottom;
    setPosition({ left, top: spaceBelow >= 110 ? rect.bottom + 8 : Math.max(12, rect.top - 104) });
  };
  const hide = () => setPosition(null);
  return <>
    <button ref={trigger} type="button" className={`comp-multiple-note${extreme ? " extreme" : ""}`} aria-describedby={position ? tooltipId : undefined} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={show} onKeyDown={(event) => { if (event.key === "Escape") hide(); }}>{children}</button>
    {position && createPortal(<span id={tooltipId} role="tooltip" className="comp-multiple-tooltip" style={position}>{detail}</span>, document.body)}
  </>;
}

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

export default function ComparableCompanyAnalysis({ data, onChange, onRefresh, refreshing = false, refreshError = "" }: { data: CompanyData; onChange: (data: CompanyData) => void; onRefresh?: () => void; refreshing?: boolean; refreshError?: string }) {
  const [manualTicker, setManualTicker] = useState("");
  const [compEditorOpen, setCompEditorOpen] = useState(false);
  const compTickerInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (compEditorOpen) compTickerInput.current?.focus(); }, [compEditorOpen]);
  const [adding, setAdding] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
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
  const exitBenchmark = peerExitBenchmark(peers);
  const metrics = { growth: peerMetric("revenueGrowth"), margin: peerMetric("operatingMargin"), marketCap: peerMetric("marketCap"), multiple: exitBenchmark.selected, revenueMultiple: peerMetric("evToRevenue"), pe: peerMetric("pe") };
  const compKeys = ["marketCap", "enterpriseValue", "evToRevenueLtm", "evToRevenueNtm", "evToEbitdaLtm", "evToEbitdaNtm", "evToEbitLtm", "evToEbitNtm"] as const;
  const profitMultipleKeys = new Set(["evToEbitdaLtm", "evToEbitdaNtm", "evToEbitLtm", "evToEbitNtm"]);
  const usablePeerValues = (key: (typeof compKeys)[number]) => peers.flatMap((peer) => {
    const value = peer[key];
    if (value === null || value === undefined || !Number.isFinite(value)) return [];
    if (profitMultipleKeys.has(key)) {
      const quality = peer[`${key}Quality` as keyof ComparableCompany];
      if (value <= 0 || value > 100 || quality === "not-meaningful" || quality === "extreme") return [];
    }
    return [value];
  });
  const compMedian = Object.fromEntries(compKeys.map((key) => [key, median(usablePeerValues(key))])) as Record<(typeof compKeys)[number], number | null>;
  const compMean = Object.fromEntries(compKeys.map((key) => [key, mean(usablePeerValues(key))])) as Record<(typeof compKeys)[number], number | null>;
  const formatMetric = (value: number | null, suffix = "×") => value === null || !Number.isFinite(value) ? "N/A" : `${fmt.format(value)}${suffix}`;
  const formatCap = (value: number | null) => value === null || !Number.isFinite(value) ? "N/A" : value >= 1000 ? `$${fmt.format(value / 1000)}B` : `$${fmt.format(value)}M`;
  const multipleCell = (peer: ComparableCompany, key: "evToRevenueLtm" | "evToRevenueNtm" | "evToEbitdaLtm" | "evToEbitdaNtm" | "evToEbitLtm" | "evToEbitNtm") => {
    const quality = peer[`${key}Quality` as keyof ComparableCompany];
    if (quality === "not-meaningful") return <MultipleNote detail={peer[key] == null ? "Division by zero is undefined; no numeric multiple is available." : "Negative profit denominator. The signed result is shown for transparency but excluded from peer summary statistics and the automatic exit multiple."}>{formatMetric(peer[key] ?? null)}<sup>!</sup></MultipleNote>;
    if (quality === "extreme") return <MultipleNote extreme detail="Large multiple or small profit denominator. Shown for transparency but excluded from peer summary statistics and the automatic exit multiple.">{formatMetric(peer[key] ?? null)}<sup>!</sup></MultipleNote>;
    return formatMetric(peer[key] ?? null);
  };
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

  const savePeers = (updated: ComparableCompany[]) => {
    if (!saveManualPeers(data.company.symbol, updated)) throw new Error("Browser storage is unavailable. Enable storage to save manual comps.");
    onChange(withManualPeers(data));
  };
  const addPeer = async (event: FormEvent) => {
    event.preventDefault();
    if (adding) return;
    const symbol = normalizeTicker(manualTicker);
    setManualMessage("");
    if (!symbol) { setManualMessage("Enter a valid ticker, such as AAPL."); return; }
    const issuer = (ticker: string) => ticker === "GOOG" ? "GOOGL" : ticker;
    if (issuer(symbol) === issuer(company.symbol) || peers.some((peer) => issuer(peer.symbol) === issuer(symbol))) {
      setManualMessage("This company or share class is already in the comparison."); return;
    }
    if (peers.length >= 20) { setManualMessage("The comparison supports up to 20 peers. Remove a manual comp before adding another."); return; }
    setAdding(true);
    try {
      const response = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}&view=valuation`);
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Unable to load this comparable company."));
      const peer: ComparableCompany | undefined = payload.comparison?.company;
      if (!peer || peer.symbol !== symbol) throw new Error("The provider did not return comparable data for this ticker.");
      savePeers([...readManualPeers(company.symbol), { ...peer, peerFit: undefined, manualAdded: true, peerRationale: `Manually selected by you. Data retrieved ${payload.asOf}. Assess business and currency comparability before interpreting the multiples.` }]);
      setManualTicker("");
      setManualMessage(`${symbol} added. Peer statistics updated.`);
    } catch (caught) { setManualMessage(caught instanceof Error ? caught.message : "Unable to add this comp."); }
    finally { setAdding(false); }
  };
  const removePeer = (symbol: string) => {
    try {
      savePeers(readManualPeers(company.symbol).filter((peer) => peer.symbol !== symbol));
      setManualMessage(`${symbol} removed. Peer statistics updated.`);
    } catch (caught) { setManualMessage(caught instanceof Error ? caught.message : "Unable to remove this comp."); }
  };

  return <section className="analysis-section comps-analysis" id="competitors">
    <div className="analysis-heading"><div><h2>Comparable companies</h2></div><p>{comparison?.nicheLabel || businessFocus(company)}</p></div>
    <div className="comps-freshness"><span>{observationStale(data.retrievedAt) || rows.some((peer) => observationStale(peer.retrievedAt)) ? "Some data needs refreshing" : "Data retrieved"} · {data.retrievedAt ? new Date(data.retrievedAt).toLocaleString() : "date unavailable"}</span>{onRefresh && <button type="button" disabled={refreshing || adding} onClick={onRefresh}>{refreshing ? "Refreshing…" : "Refresh data"}</button>}{refreshError && <p role="alert">{refreshError}</p>}</div>
    <div className="peer-summary"><div><span>PEER MEDIAN GROWTH</span><strong>{metrics.growth == null ? "N/A" : `${fmt.format(metrics.growth)}%`}</strong></div><div><span>{financialCompany ? "PEER MEDIAN P / E" : "PEER MEDIAN EV / EBITDA LTM"}</span><strong>{formatMetric(financialCompany ? metrics.pe : metrics.multiple)}</strong></div></div>
    <div className="peer-table-wrap table-scroll"><table className="peer-table peer-valuation-table"><thead><tr><th rowSpan={2}>Company</th><th rowSpan={2}>Business focus</th><th rowSpan={2}>Market cap</th><th rowSpan={2}>TEV</th><th colSpan={2}>EV / Revenue</th><th colSpan={2}>EV / EBITDA</th><th colSpan={2}>EV / EBIT</th></tr><tr><th>LTM</th><th>FY1E</th><th>LTM</th><th>FY1E</th><th>LTM</th><th>FY1E</th></tr></thead><tbody>
      {rows.map((peer, index) => <tr className={index === 0 ? "focus-company" : ""} key={peer.symbol}><td><b>{peer.symbol}</b><span>{peer.name}</span>{index === 0 && <em>FOCUS COMPANY</em>}{peer.manualAdded && <em>MANUAL COMP</em>}</td><td className="business-focus-cell"><b>{rowBusiness(peer, index)}</b>{index > 0 && fitLabel(peer.peerFit) && <span className="peer-fit-indicator">{fitLabel(peer.peerFit)}</span>}{index > 0 && peer.peerRationale && <details className="peer-rationale"><summary>Similarities</summary><small>{peer.peerRationale}</small></details>}</td><td>{formatCap(peer.marketCap)}</td><td>{formatCap(peer.enterpriseValue ?? null)}</td><td>{multipleCell(peer, "evToRevenueLtm")}</td><td>{multipleCell(peer, "evToRevenueNtm")}</td><td>{multipleCell(peer, "evToEbitdaLtm")}</td><td>{multipleCell(peer, "evToEbitdaNtm")}</td><td>{multipleCell(peer, "evToEbitLtm")}</td><td>{multipleCell(peer, "evToEbitNtm")}</td></tr>)}
      {peers.length > 0 && <tr className="peer-median"><td><b>MEDIAN</b><span>{peers.length} peers</span></td><td></td><td>{formatCap(compMedian.marketCap)}</td><td>{formatCap(compMedian.enterpriseValue)}</td><td>{formatMetric(compMedian.evToRevenueLtm)}</td><td>{formatMetric(compMedian.evToRevenueNtm)}</td><td>{formatMetric(compMedian.evToEbitdaLtm)}</td><td>{formatMetric(compMedian.evToEbitdaNtm)}</td><td>{formatMetric(compMedian.evToEbitLtm)}</td><td>{formatMetric(compMedian.evToEbitNtm)}</td></tr>}
      {peers.length > 0 && <tr className="peer-mean"><td><b>AVERAGE</b><span>{peers.length} peers</span></td><td></td><td>{formatCap(compMean.marketCap)}</td><td>{formatCap(compMean.enterpriseValue)}</td><td>{formatMetric(compMean.evToRevenueLtm)}</td><td>{formatMetric(compMean.evToRevenueNtm)}</td><td>{formatMetric(compMean.evToEbitdaLtm)}</td><td>{formatMetric(compMean.evToEbitdaNtm)}</td><td>{formatMetric(compMean.evToEbitLtm)}</td><td>{formatMetric(compMean.evToEbitNtm)}</td></tr>}
    </tbody></table></div>
    <div className="manual-comps">
      <button type="button" className="add-comp-trigger" aria-expanded={compEditorOpen} aria-controls="custom-comp-editor" disabled={adding} onClick={() => { setCompEditorOpen((open) => !open); setManualMessage(""); }}><span aria-hidden="true">+</span> Add comp</button>
      <div id="custom-comp-editor" hidden={!compEditorOpen}>
        <form onSubmit={addPeer} className="manual-comps-form"><label htmlFor="manual-comp-ticker">Company ticker<input ref={compTickerInput} id="manual-comp-ticker" value={manualTicker} onChange={(event) => setManualTicker(event.target.value)} placeholder="e.g. AMAT" maxLength={12} autoCapitalize="characters" autoComplete="off" disabled={adding}/></label><button type="submit" disabled={adding}>{adding ? "Calculating…" : "Calculate & add"}</button></form>
        <p>Enter a ticker to load its financials and calculate available ratios. Raw signed results remain visible, but non-meaningful and extreme profit multiples do not set the automatic exit multiple.</p>
        <p>Saved in this browser for {company.symbol}. Missing provider data stays N/A.</p>
      </div>
      {peers.some((peer) => peer.manualAdded) && <div className="manual-comp-list">{peers.filter((peer) => peer.manualAdded).map((peer) => <button key={peer.symbol} type="button" disabled={adding} onClick={() => removePeer(peer.symbol)} aria-label={`Remove manual comp ${peer.symbol}`}>{peer.symbol} ×</button>)}</div>}
      <p role="status" aria-live="polite">{manualMessage}</p>
    </div>

    {!peers.length && <div className="peer-empty">Comparable ratios were not returned for this request.</div>}
    <details className="peer-details"><summary>Business comparison</summary><div className="business-review"><article className="business-difference-card"><h3>{detailed.title}</h3><p>{detailed.summary}</p><div className="business-difference-grid">{detailed.dimensions.map((dimension) => <div key={dimension.label}><b>{dimension.label}</b><p>{dimension.detail}</p></div>)}</div>{detailed.peerModels.length > 0 && <div className="peer-model-list"><b>Peers</b><div>{detailed.peerModels.map((peer) => <section key={peer.symbol}><strong>{peer.symbol}: {peer.name}</strong><p>{peer.detail}</p></section>)}</div></div>}</article></div><h3 className="difference-title">Financial comparison</h3><div className="difference-grid">{insights.map((insight) => <article key={insight.label}><span>{insight.label}</span><strong>{insight.value}</strong><p>{insight.detail}</p></article>)}</div>{Boolean(comparison?.operatingCompetitors?.length) && <p className="peer-disclaimer">Other competitors: {comparison?.operatingCompetitors?.join(", ")}</p>}</details>
    <details className="peer-methodology"><summary>Data notes</summary>{data.denomination && <p>Quote: {data.denomination.quoteCurrency}; issuer reporting: {data.denomination.issuerReportingCurrency}; financial display: {data.denomination.financialDisplayCurrency}. {data.denomination.normalizationStatus}. <a href={data.denomination.sourceUrl} target="_blank" rel="noreferrer">Issuer / denomination source ↗</a>{data.denomination.securitySourceUrl && <> · <a href={data.denomination.securitySourceUrl} target="_blank" rel="noreferrer">Security ratio: {data.denomination.ordinarySharesPerQuotedSecurity} ordinary share per quoted security ↗</a></>}</p>}{data.shareBasis && <p>{data.shareBasis.status}. Annual diluted: {data.shareBasis.annualDilutedShares == null ? "N/A" : `${fmt.format(data.shareBasis.annualDilutedShares)}M`} ({data.shareBasis.annualPeriodEnd || "date unavailable"}); market-cap / price proxy: {data.shareBasis.marketCapImpliedShares == null ? "N/A" : `${fmt.format(data.shareBasis.marketCapImpliedShares)}M`}. Reconcile all share classes, issuance, buybacks, splits, options, RSUs and convertibles.</p>}{financialCompany && <p>Bank and insurer EV ratios are raw arithmetic only. Use equity, tangible book and regulatory-capital measures for valuation.</p>}<ul>{rows.map((peer) => <li key={peer.symbol}><b>{peer.symbol}</b> · Financials: {peer.financialsAsOf || peer.ltmBasis || "date unavailable"}; balance: {peer.balanceAsOf || "date unavailable"}; FY1E: {peer.forwardPeriodEnd || "unavailable"}; retrieved: {peer.retrievedAt || "unavailable"}. {peer.sourceUrl && <a href={peer.sourceUrl} target="_blank" rel="noreferrer">Financial source ↗</a>} {peer.dataNotes?.join(" ")}</li>)}</ul><p>Missing data and zero denominators show N/A. Negative or extreme profit multiples remain visible in company rows but are excluded from summary statistics and the automatic exit multiple. Each summary column uses its own available observations.</p><p>{comparison?.selectionBasis || "Peers are selected using products, customers, and operating model."}</p><p>LTM uses the latest four reported quarters when available. If a provider omits quarterly statements, the latest reported fiscal year is used and identified here. FY1E means the full fiscal-year estimate identified below, not rolling next 12 months. FY1E revenue uses available consensus. FY1E EBIT and EBITDA hold the historical margin constant; they are not consensus earnings. TEV equals market capitalization plus funded debt and available preferred/minority claims, less cash and included investments. Lease adjustments require consistent operating metrics.</p>{rows.some((peer) => peer.ltmBasis?.startsWith("Latest reported fiscal year")) && <p>Fiscal-year fallback: {rows.filter((peer) => peer.ltmBasis?.startsWith("Latest reported fiscal year")).map((peer) => `${peer.symbol} (${peer.ltmBasis})`).join("; ")}.</p>}</details>
  </section>;
}
