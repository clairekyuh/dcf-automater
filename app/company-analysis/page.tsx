"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CustomerDisclosure = { customer: string; revenuePercent: number; disclosure: string };
type Signal = { level: "high" | "medium" | "low"; title: string; detail: string };
type CompanyAnalysisData = {
  source: string;
  asOf: string;
  company: { symbol: string; name: string; description: string; exchange: string; country: string; sector: string; industry: string };
  businessAnalysis?: {
    source: string;
    asOf: string | null;
    companyDescription: string;
    financials: {
      revenue: number | null; cogs: number | null; cogsPercentRevenue: number | null; grossProfit: number | null; grossMargin: number | null;
      operatingCashFlow: number | null; freeCashFlow: number | null; currentAssets: number | null; currentLiabilities: number | null;
      interestExpense: number | null; ebitda: number | null; netDebt: number | null;
    };
    customerConcentration: { disclosures: CustomerDisclosure[]; noMajorCustomer: boolean; disclosureThreshold: number };
    supplyChain: { stages: Array<{ name: string; detail: string }>; signals: Signal[]; filingReviewed: boolean };
    defaultRisk: {
      level: "high" | "moderate" | "low" | "insufficient"; points: number; availableChecks?: number; drivers: string[];
      ratios: { debtToRevenue: number | null; netDebtToEbitda: number | null; currentRatio: number | null; interestCoverage: number | null; fcfToDebt: number | null };
      altmanZ: number | null; altmanZone: string | null; altmanApplicable: boolean; altmanReason?: string; methodology: string;
    };
    filing: { form: string; filingDate: string; reportDate: string; url: string } | null;
  };
};

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function shortDescription(description: string | undefined) {
  if (!description) return "A concise company description could not be extracted from the latest SEC annual filing.";
  const sentences = description.trim().match(/[^.!?]+[.!?]+/g) || [description];
  const result = sentences.slice(0, 2).join(" ").trim();
  return result.length > 420 ? `${result.slice(0, 417).trimEnd()}…` : result;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="analysis-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export default function CompanyAnalysisPage() {
  const [data, setData] = useState<CompanyAnalysisData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("symbol")?.toUpperCase();
    const stored = sessionStorage.getItem("dcf:last-company") || localStorage.getItem("dcf:last-company");
    if (!stored) { setMissing(true); return; }
    try {
      const parsed = JSON.parse(stored) as CompanyAnalysisData;
      if (requested && parsed.company.symbol !== requested) { setMissing(true); return; }
      setData(parsed);
    } catch {
      setMissing(true);
    }
  }, []);

  if (!data || !data.businessAnalysis) return <main className="analysis-page"><nav className="analysis-nav"><Link href="/">← DCF Calculator</Link></nav><section className="analysis-missing"><span>COMPANY ANALYSIS</span><h1>{missing ? "Load a ticker first" : "Preparing analysis…"}</h1><p>The separate analysis page uses the company most recently loaded in the DCF calculator. Return to the calculator, build a ticker analysis, then open this page from the company summary.</p><Link href="/">Return to calculator →</Link></section></main>;

  const analysis = data.businessAnalysis;
  const financials = analysis.financials;
  const customers = analysis.customerConcentration.disclosures;
  const defaultRisk = analysis.defaultRisk;
  const riskClass = defaultRisk.level === "moderate" ? "medium" : defaultRisk.level;
  const stages = analysis.supplyChain.stages || [];
  const isSample = data.source === "Sample data";
  const ratio = (value: number | null, suffix = "×") => value === null || !Number.isFinite(value) ? "—" : `${fmt.format(value)}${suffix}`;
  const percentageRatio = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : `${fmt.format(value * 100)}%`;
  const monetary = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : `${money.format(value)}M`;

  return <main className="analysis-page">
    <nav className="analysis-nav"><Link href="/">← DCF Calculator</Link><span>{data.company.symbol} · Operating &amp; credit analysis</span></nav>
    <header className="analysis-hero"><p>{isSample ? "ILLUSTRATIVE COMPANY ANALYSIS" : "SEC-SOURCED COMPANY ANALYSIS"}</p><h1>{data.company.name}</h1><div><span>{data.company.sector}</span><span>{data.company.industry}</span><span>{data.company.country}</span></div><h2>What the company does</h2><p>{shortDescription(analysis.companyDescription || data.company.description)}</p></header>

    <section className="analysis-section">
      <div className="analysis-heading"><div><span>01</span><p>OPERATING CHAIN</p><h2>Supply chain analysis</h2></div><p>{isSample ? "This sample demonstrates how the SEC-derived operating-chain profile and dependency flags will appear after a ticker is loaded." : "The operating-chain profile and dependency flags are derived only from the latest SEC 10-K or 20-F business description and risk disclosures."}</p></div>
      {stages.length ? <div className="supply-flow">{stages.map((stage, index) => <article key={stage.name}><span>{String(index + 1).padStart(2, "0")}</span><h3>{stage.name}</h3><p>{stage.detail}</p></article>)}</div> : <div className="analysis-empty">The SEC filing was unavailable or did not contain enough filing text to construct a reliable operating-chain profile. No provider-based substitute was used.</div>}
      <h3 className="analysis-subtitle">Disclosed dependency signals</h3>
      {analysis.supplyChain.signals.length ? <div className="analysis-risk-grid">{analysis.supplyChain.signals.map((signal) => <article key={signal.title}><span className={`risk-pill ${signal.level}`}>{signal.level}</span><h3>{signal.title}</h3><p>{signal.detail}</p></article>)}</div> : <div className="analysis-empty">No specific supply-chain dependency phrase was detected in the available annual filing. That is not proof that no dependency exists.</div>}
    </section>

    <section className="analysis-section">
      <div className="analysis-heading"><div><span>02</span><p>CONCENTRATION</p><h2>Customer revenue exposure</h2></div><p>Major-customer disclosures generally identify customers representing 10% or more of revenue, but filings may use labels such as “Customer A” rather than a legal name.</p></div>
      {customers.length ? <div className="customer-table"><div className="customer-row header"><span>Disclosed customer</span><span>Share of revenue</span><span>Source</span></div>{customers.map((customer, index) => <div className="customer-row" key={`${customer.customer}-${index}`}><strong>{customer.customer}</strong><div><b>{fmt.format(customer.revenuePercent)}%</b><i><span style={{ width: `${Math.min(customer.revenuePercent, 100)}%` }}/></i></div><small>{customer.disclosure}</small></div>)}</div> : <div className="analysis-empty">{analysis.customerConcentration.noMajorCustomer ? `The filing indicates no individual customer exceeded the ${analysis.customerConcentration.disclosureThreshold}% disclosure threshold.` : "No reliable customer-specific revenue percentage was detected in the available filing. The company may have no reportable concentration, may describe it differently, or the filing may not have been available in parseable HTML."}</div>}
      <p className="analysis-note">A disclosed percentage measures the company’s revenue from that customer. It does not reveal the customer’s own COGS or profitability.</p>
    </section>

    <section className="analysis-section">
      <div className="analysis-heading"><div><span>03</span><p>COST STRUCTURE</p><h2>COGS and gross economics</h2></div><p>These are costs incurred by {data.company.name}, not costs incurred by one of its customers. Public filings normally do not allocate company-wide COGS to individual customers.</p></div>
      <div className="analysis-metrics four"><Metric label="Revenue" value={monetary(financials.revenue)} detail={isSample ? `Illustrative period ending ${analysis.asOf}` : analysis.asOf ? `SEC fiscal period ending ${analysis.asOf}` : "SEC annual fact unavailable"}/><Metric label="Company COGS / cost of revenue" value={monetary(financials.cogs)} detail={financials.cogsPercentRevenue === null ? "Not separately available in SEC facts" : `${fmt.format(financials.cogsPercentRevenue)}% of revenue`}/><Metric label="Gross profit" value={monetary(financials.grossProfit)} detail={isSample ? "Illustrative revenue less cost of revenue" : "Reported or derived from SEC revenue less SEC cost of revenue"}/><Metric label="Gross margin" value={ratio(financials.grossMargin, "%")} detail="Before operating expenses, interest, and tax"/></div>
      <p className="analysis-note">For banks, insurers, and some service companies, “COGS” may not be a meaningful or separately reported line. If a named customer is public, its own COGS would require a separate analysis of that customer’s filings.</p>
    </section>

    <section className="analysis-section default-section">
      <div className="analysis-heading"><div><span>04</span><p>SOLVENCY</p><h2>Default-risk evaluation</h2></div><div className={`default-verdict ${riskClass}`}><span>AUTOMATED SCREEN</span><strong>{defaultRisk.level === "insufficient" ? "insufficient data" : `${defaultRisk.level} risk`}</strong><small>{defaultRisk.level === "insufficient" ? `${defaultRisk.availableChecks || 0} of 5 checks available` : `${defaultRisk.points} risk points`}</small></div></div>
      <div className="analysis-metrics five"><Metric label="Debt / revenue" value={ratio(defaultRisk.ratios.debtToRevenue)} detail="Balance-sheet leverage relative to sales"/><Metric label="Net debt / EBITDA" value={ratio(defaultRisk.ratios.netDebtToEbitda)} detail="Debt less cash relative to operating earnings"/><Metric label="Current ratio" value={ratio(defaultRisk.ratios.currentRatio)} detail="Current assets divided by current liabilities"/><Metric label="Interest coverage" value={ratio(defaultRisk.ratios.interestCoverage)} detail="EBIT divided by interest expense"/><Metric label="FCF / debt" value={percentageRatio(defaultRisk.ratios.fcfToDebt)} detail="Annual free cash flow relative to funded debt"/></div>
      <div className="default-detail"><div><h3>What drives the result</h3><ul>{defaultRisk.drivers.map((driver) => <li key={driver}>{driver}</li>)}</ul></div><div><h3>Altman Z-score cross-check</h3>{defaultRisk.altmanApplicable && defaultRisk.altmanZ !== null ? <><strong>{fmt.format(defaultRisk.altmanZ)}</strong><p>Zone: {defaultRisk.altmanZone}. The original model was developed for publicly traded manufacturers and is less reliable outside that setting.</p></> : <p>{defaultRisk.altmanReason || "Not shown because the company’s sector or available facts do not fit the original model well."}</p>}</div></div>
      <p className="analysis-note">{defaultRisk.methodology} Debt maturities, covenant terms, undrawn credit, refinancing access, and off-balance-sheet obligations still require manual filing review.</p>
    </section>

    <section className="analysis-sources"><div><span>SOURCE CHECK</span><h2>What the page actually reviewed</h2></div>{isSample ? <ul><li>This is illustrative sample data. Load a real SEC-reporting ticker to retrieve SEC Company Facts and its latest annual filing.</li><li><a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces" target="_blank" rel="noreferrer">SEC filing and Company Facts API documentation ↗</a></li></ul> : <ul><li>{analysis.asOf ? `Structured annual financial facts through ${analysis.asOf} from SEC Company Facts.` : "SEC Company Facts were unavailable; missing financial fields were not replaced with another provider."}</li><li>{analysis.supplyChain.filingReviewed ? "The latest SEC annual filing was available for automated business-description, customer, and dependency screening." : "The latest SEC annual filing was not available in parseable form; narrative conclusions are limited."}</li><li>{analysis.filing ? <a href={analysis.filing.url} target="_blank" rel="noreferrer">Open the SEC {analysis.filing.form} filed {analysis.filing.filingDate} ↗</a> : "No SEC annual-filing link was returned."}</li><li><a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces" target="_blank" rel="noreferrer">SEC filing and Company Facts API documentation ↗</a></li><li><a href="https://doi.org/10.1111/j.1540-6261.1968.tb00843.x" target="_blank" rel="noreferrer">Altman’s original bankruptcy-prediction paper ↗</a></li></ul>}</section>
    <footer><span>Automated research aid—not a credit rating or investment recommendation.</span><Link href="/">Return to DCF Calculator →</Link></footer>
  </main>;
}
