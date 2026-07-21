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
    financials: {
      revenue: number | null; cogs: number | null; cogsPercentRevenue: number | null; grossProfit: number | null; grossMargin: number | null;
      operatingCashFlow: number | null; freeCashFlow: number | null; currentAssets: number | null; currentLiabilities: number | null;
      interestExpense: number | null; ebitda: number | null; netDebt: number | null;
    };
    customerConcentration: { disclosures: CustomerDisclosure[]; noMajorCustomer: boolean; disclosureThreshold: number };
    supplyChain: { signals: Signal[]; filingReviewed: boolean };
    defaultRisk: {
      level: "high" | "moderate" | "low"; points: number; drivers: string[];
      ratios: { debtToRevenue: number | null; netDebtToEbitda: number | null; currentRatio: number | null; interestCoverage: number | null; fcfToDebt: number | null };
      altmanZ: number | null; altmanZone: string | null; altmanApplicable: boolean; methodology: string;
    };
    filing: { form: string; filingDate: string; reportDate: string; url: string } | null;
  };
};

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function shortDescription(description: string) {
  const sentences = description.trim().match(/[^.!?]+[.!?]+/g) || [description];
  const result = sentences.slice(0, 2).join(" ").trim();
  return result.length > 420 ? `${result.slice(0, 417).trimEnd()}…` : result;
}

function supplyProfile(data: CompanyAnalysisData) {
  const text = `${data.company.industry} ${data.company.sector} ${data.company.description}`;
  const profiles = [
    { match: /electronic design automation|semiconductor ip/i, stages: [
      { name: "Critical inputs", detail: "Engineering talent, proprietary algorithms, semiconductor process data, and licensed technology." },
      { name: "Operations", detail: "Develops chip-design software, verification tools, and reusable semiconductor IP." },
      { name: "Delivery", detail: "Software licenses, subscriptions, support, and IP agreements delivered directly to chip designers." },
      { name: "End customers", detail: "Semiconductor companies, systems companies, foundries, and electronics designers." },
    ] },
    { match: /semiconductor/i, stages: [
      { name: "Critical inputs", detail: "Chip-design tools, intellectual property, wafers, manufacturing equipment, substrates, and specialty materials." },
      { name: "Operations", detail: "Designs chips and may rely on external foundries, assembly providers, and test partners." },
      { name: "Distribution", detail: "Direct sales, distributors, cloud partners, and original-equipment manufacturers." },
      { name: "End customers", detail: "Data centers, device makers, automakers, industrial users, and consumers." },
    ] },
    { match: /cloud|software|saas|internet/i, stages: [
      { name: "Critical inputs", detail: "Software engineers, intellectual property, data-center capacity, cloud services, and third-party technology." },
      { name: "Operations", detail: "Develops, hosts, secures, and supports software or computing services." },
      { name: "Delivery", detail: "Subscriptions, consumption contracts, licenses, direct sales, and channel partners." },
      { name: "End customers", detail: "Businesses, governments, developers, or consumers depending on the product mix." },
    ] },
    { match: /automotive|vehicle/i, stages: [
      { name: "Critical inputs", detail: "Steel, aluminum, batteries, semiconductors, electronics, components, and skilled labor." },
      { name: "Operations", detail: "Vehicle engineering, assembly, quality control, logistics, and financing support." },
      { name: "Distribution", detail: "Dealers, direct sales, fleets, service centers, and financing channels." },
      { name: "End customers", detail: "Consumers, commercial fleets, rental companies, and governments." },
    ] },
    { match: /retail|consumer|restaurant/i, stages: [
      { name: "Critical inputs", detail: "Finished goods, ingredients, packaging, private-label manufacturing, labor, and transportation." },
      { name: "Operations", detail: "Merchandising, inventory planning, stores or fulfillment centers, marketing, and customer service." },
      { name: "Distribution", detail: "Physical stores, e-commerce, wholesalers, marketplaces, and last-mile delivery." },
      { name: "End customers", detail: "Consumers and, in some cases, restaurants, institutions, or resellers." },
    ] },
    { match: /pharma|biotech|therapeutic/i, stages: [
      { name: "Critical inputs", detail: "Research talent, clinical data, active ingredients, biologic materials, and contract research services." },
      { name: "Operations", detail: "Discovery, clinical trials, regulatory approval, manufacturing, and quality control." },
      { name: "Distribution", detail: "Wholesalers, specialty pharmacies, hospitals, physicians, and licensing partners." },
      { name: "End customers", detail: "Patients and healthcare providers, with payment influenced by insurers and governments." },
    ] },
    { match: /industrial|manufactur|aerospace|defense/i, stages: [
      { name: "Critical inputs", detail: "Raw materials, precision components, electronics, energy, suppliers, and skilled labor." },
      { name: "Operations", detail: "Engineering, fabrication, assembly, testing, maintenance, and project execution." },
      { name: "Distribution", detail: "Direct contracts, distributors, service networks, and long-term customer programs." },
      { name: "End customers", detail: "Industrial companies, airlines, defense agencies, infrastructure operators, and governments." },
    ] },
  ];
  return profiles.find((profile) => profile.match.test(text))?.stages || [
    { name: "Critical inputs", detail: "Labor, technology, suppliers, capital, and third-party services required to operate." },
    { name: "Operations", detail: "Produces and supports the products or services described in the company profile." },
    { name: "Distribution", detail: "Uses direct sales, partners, distributors, or digital channels depending on the business." },
    { name: "End customers", detail: "Customer mix was not fully classified from the available provider description." },
  ];
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
  const stages = supplyProfile(data);
  const ratio = (value: number | null, suffix = "×") => value === null || !Number.isFinite(value) ? "—" : `${fmt.format(value)}${suffix}`;
  const percentageRatio = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : `${fmt.format(value * 100)}%`;
  const monetary = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : `${money.format(value)}M`;

  return <main className="analysis-page">
    <nav className="analysis-nav"><Link href="/">← DCF Calculator</Link><span>{data.company.symbol} · Operating &amp; credit analysis</span></nav>
    <header className="analysis-hero"><p>SEPARATE COMPANY ANALYSIS</p><h1>{data.company.name}</h1><div><span>{data.company.sector}</span><span>{data.company.industry}</span><span>{data.company.country}</span></div><h2>What the company does</h2><p>{shortDescription(data.company.description)}</p></header>

    <section className="analysis-section">
      <div className="analysis-heading"><div><span>01</span><p>OPERATING CHAIN</p><h2>Supply chain analysis</h2></div><p>This maps the likely operating chain from the provider’s business description and adds dependency signals found in the latest annual filing.</p></div>
      <div className="supply-flow">{stages.map((stage, index) => <article key={stage.name}><span>{String(index + 1).padStart(2, "0")}</span><h3>{stage.name}</h3><p>{stage.detail}</p></article>)}</div>
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
      <div className="analysis-metrics four"><Metric label="Revenue" value={monetary(financials.revenue)} detail={`Fiscal period ending ${data.asOf}`}/><Metric label="Company COGS / cost of revenue" value={monetary(financials.cogs)} detail={financials.cogsPercentRevenue === null ? "Not separately available" : `${fmt.format(financials.cogsPercentRevenue)}% of revenue`}/><Metric label="Gross profit" value={monetary(financials.grossProfit)} detail="Revenue less reported cost of revenue"/><Metric label="Gross margin" value={ratio(financials.grossMargin, "%")} detail="Before operating expenses, interest, and tax"/></div>
      <p className="analysis-note">For banks, insurers, and some service companies, “COGS” may not be a meaningful or separately reported line. If a named customer is public, its own COGS would require a separate analysis of that customer’s filings.</p>
    </section>

    <section className="analysis-section default-section">
      <div className="analysis-heading"><div><span>04</span><p>SOLVENCY</p><h2>Default-risk evaluation</h2></div><div className={`default-verdict ${riskClass}`}><span>AUTOMATED SCREEN</span><strong>{defaultRisk.level} risk</strong><small>{defaultRisk.points} risk points</small></div></div>
      <div className="analysis-metrics five"><Metric label="Debt / revenue" value={ratio(defaultRisk.ratios.debtToRevenue)} detail="Balance-sheet leverage relative to sales"/><Metric label="Net debt / EBITDA" value={ratio(defaultRisk.ratios.netDebtToEbitda)} detail="Debt less cash relative to operating earnings"/><Metric label="Current ratio" value={ratio(defaultRisk.ratios.currentRatio)} detail="Current assets divided by current liabilities"/><Metric label="Interest coverage" value={ratio(defaultRisk.ratios.interestCoverage)} detail="EBIT divided by interest expense"/><Metric label="FCF / debt" value={percentageRatio(defaultRisk.ratios.fcfToDebt)} detail="Annual free cash flow relative to funded debt"/></div>
      <div className="default-detail"><div><h3>What drives the result</h3><ul>{defaultRisk.drivers.map((driver) => <li key={driver}>{driver}</li>)}</ul></div><div><h3>Altman Z-score cross-check</h3>{defaultRisk.altmanApplicable && defaultRisk.altmanZ !== null ? <><strong>{fmt.format(defaultRisk.altmanZ)}</strong><p>Zone: {defaultRisk.altmanZone}. The original model was developed for publicly traded manufacturers and is less reliable outside that setting.</p></> : <p>Not shown because the company’s sector or available facts do not fit the original model well.</p>}</div></div>
      <p className="analysis-note">{defaultRisk.methodology} Debt maturities, covenant terms, undrawn credit, refinancing access, and off-balance-sheet obligations still require manual filing review.</p>
    </section>

    <section className="analysis-sources"><div><span>SOURCE CHECK</span><h2>What the page actually reviewed</h2></div><ul><li>Structured financial statements through {data.asOf} from {data.source}.</li><li>{analysis.supplyChain.filingReviewed ? "The latest annual filing was available for automated narrative screening." : "The latest annual filing was not available in parseable form; narrative conclusions are limited."}</li><li>{analysis.filing ? <a href={analysis.filing.url} target="_blank" rel="noreferrer">Open the {analysis.filing.form} filed {analysis.filing.filingDate} ↗</a> : "No annual-filing link was returned."}</li><li><a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces" target="_blank" rel="noreferrer">SEC filing and Company Facts API documentation ↗</a></li><li><a href="https://doi.org/10.1111/j.1540-6261.1968.tb00843.x" target="_blank" rel="noreferrer">Altman’s original bankruptcy-prediction paper ↗</a></li></ul></section>
    <footer><span>Automated research aid—not a credit rating or investment recommendation.</span><Link href="/">Return to DCF Calculator →</Link></footer>
  </main>;
}
