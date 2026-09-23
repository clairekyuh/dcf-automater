"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CompanyNavigation from "@/app/components/company-navigation";
import ComparableCompanyAnalysis from "@/app/components/comparable-company-analysis";
import { apiErrorMessage } from "@/lib/client/api-error";
import { readCompanyData, storeCompanyData } from "@/lib/client/company-storage";
import type { CompanyData } from "@/lib/company-data";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function shortDescription(description: string | undefined) {
  if (!description) return "Company description unavailable.";
  const sentences = description.trim().match(/[^.!?]+[.!?]+/g) || [description];
  const result = sentences.slice(0, 2).join(" ").trim();
  return result.length > 360 ? `${result.slice(0, 357).trimEnd()}…` : result;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="analysis-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function ComparableCompaniesSkeleton() {
  return <section className="analysis-section comps-analysis comps-skeleton" aria-busy="true" aria-live="polite">
    <div className="comps-skeleton-heading"><i/><div><i/><i/></div></div>
    <div className="comps-skeleton-summary"><div><i/><i/></div><div><i/><i/></div></div>
    <div className="comps-skeleton-table" aria-label="Loading comparable companies">
      <div className="comps-skeleton-table-head">{Array.from({ length: 10 }, (_, index) => <i key={index}/>)}</div>
      {Array.from({ length: 5 }, (_, row) => <div className="comps-skeleton-table-row" key={row}>{Array.from({ length: 10 }, (_, column) => <i key={column}/>)}</div>)}
    </div>
  </section>;
}

export default function CompanyAnalysisPage() {
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      const requested = new URLSearchParams(window.location.search).get("symbol")?.trim().toUpperCase();
      const cached = readCompanyData(requested);
      const hasCurrentComps = Boolean(cached?.comparison?.company.enterpriseValue !== undefined
        && cached.comparison.peers.every((peer) => peer.enterpriseValue !== undefined && peer.evToRevenueLtm !== undefined && peer.ltmBasis !== undefined));
      if (cached && hasCurrentComps) setData(cached);
      const symbol = requested || cached?.company.symbol;
      const needsRefresh = !cached || !hasCurrentComps || cached.coverage !== "full" || cached.businessAnalysis?.secStatus !== "available" || !cached.businessAnalysis.filing;
      if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
        setLoading(false);
        return;
      }
      if (!needsRefresh) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(payload, "Unable to refresh company data."));
        if (controller.signal.aborted) return;
        const company = payload as CompanyData;
        storeCompanyData(company);
        setData(company);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (!controller.signal.aborted && (!cached || !hasCurrentComps)) setError(caught instanceof Error ? caught.message : "Unable to load this company.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  if (!data || !data.businessAnalysis) {
    if (loading) return <main className="analysis-page company-view-page"><CompanyNavigation active="company"/><header className="company-view-header comps-page-skeleton-header"><div><span>Company profile</span><h1>Company analysis</h1></div></header><ComparableCompaniesSkeleton/></main>;
    return <main className="analysis-page"><CompanyNavigation active="company"/><section className="analysis-missing"><span>COMPANY ANALYSIS</span><h1>Load a ticker first</h1><p>{error || "Enter a ticker in the DCF calculator first."}</p><Link href="/">Return to calculator →</Link></section></main>;
  }

  const analysis = data.businessAnalysis;
  const financials = analysis.financials;
  const customers = analysis.customerConcentration.disclosures;
  const defaultRisk = analysis.defaultRisk;
  const financialScreenNotApplicable = /not applicable to financial institutions/i.test(defaultRisk.methodology);
  const isSample = data.source === "Sample data";
  const secUnavailable = !isSample && analysis.secStatus === "unavailable" && !analysis.filing;
  const ratio = (value: number | null, suffix = "×") => value === null || !Number.isFinite(value) ? "N/A" : `${fmt.format(value)}${suffix}`;
  const percentageRatio = (value: number | null) => value === null || !Number.isFinite(value) ? "N/A" : `${fmt.format(value * 100)}%`;
  const monetary = (value: number | null) => value === null || !Number.isFinite(value) ? "N/A" : `${money.format(value)}M`;

  return <main className="analysis-page company-view-page">
    <CompanyNavigation symbol={data.company.symbol} name={data.company.name} active="company"/>
    <header className="company-view-header" id="analysis-top"><div><span>Company profile</span><h1>Company analysis</h1><p>{shortDescription(analysis.filing ? analysis.companyDescription : data.company.description)}</p></div><aside><strong>{data.company.name}</strong><small>{data.company.symbol} · {data.company.exchange} · {data.company.industry}</small></aside></header>

    <ComparableCompanyAnalysis data={data}/>

    <details className="analysis-secondary">
      <summary><span>Additional filing data</span><small>{secUnavailable ? "SEC unavailable" : analysis.filing ? `${analysis.filing.form} · ${analysis.filing.filingDate}` : "Available data"}</small></summary>
      <div className="analysis-secondary-body">
        {secUnavailable ? <section className="analysis-data-state"><div><h2>SEC data unavailable</h2><p>{analysis.secUnavailableReason || "The SEC did not return filing data for this request."}</p></div><Link href={`/?symbol=${encodeURIComponent(data.company.symbol)}`}>Reload company →</Link></section> : <>
          <section className="analysis-subsection"><h2>Customer concentration</h2>{customers.length ? <div className="customer-table"><div className="customer-row header"><span>Customer</span><span>Revenue share</span><span>Disclosure</span></div>{customers.map((customer, index) => <div className="customer-row" key={`${customer.customer}-${index}`}><strong>{customer.customer}</strong><b>{fmt.format(customer.revenuePercent)}%</b><small>{customer.disclosure}</small></div>)}</div> : <p>{analysis.customerConcentration.noMajorCustomer ? `No customer exceeded the ${analysis.customerConcentration.disclosureThreshold}% disclosure threshold.` : "No reliable customer percentage was found."}</p>}</section>

          <section className="analysis-subsection"><h2>Supply-chain signals</h2>{analysis.supplyChain.signals.length ? <div className="analysis-risk-grid">{analysis.supplyChain.signals.map((signal) => <article key={signal.title}><span className={`risk-pill ${signal.level}`}>{signal.level}</span><h3>{signal.title}</h3><p>{signal.detail}</p></article>)}</div> : <p>No specific dependency signal was found in the filing.</p>}</section>

          <section className="analysis-subsection"><h2>Reported economics</h2><div className="analysis-metrics four"><Metric label="Revenue" value={monetary(financials.revenue)} detail={analysis.asOf || "Date unavailable"}/><Metric label="COGS" value={monetary(financials.cogs)} detail={financials.cogsPercentRevenue === null ? "Not separately reported" : `${fmt.format(financials.cogsPercentRevenue)}% of revenue`}/><Metric label="Gross profit" value={monetary(financials.grossProfit)} detail="Revenue less COGS"/><Metric label="Gross margin" value={ratio(financials.grossMargin, "%")} detail="Before operating expenses"/></div></section>

          <section className="analysis-subsection"><h2>Credit and liquidity</h2><div className="analysis-metrics five"><Metric label="Debt / revenue" value={financialScreenNotApplicable ? "n/m" : ratio(defaultRisk.ratios.debtToRevenue)} detail="Debt relative to annual sales"/><Metric label="Net debt / EBITDA" value={financialScreenNotApplicable ? "n/m" : ratio(defaultRisk.ratios.netDebtToEbitda)} detail="Leverage after cash"/><Metric label="Current ratio" value={financialScreenNotApplicable ? "n/m" : ratio(defaultRisk.ratios.currentRatio)} detail="Current assets ÷ liabilities"/><Metric label="Interest coverage" value={financialScreenNotApplicable ? "n/m" : ratio(defaultRisk.ratios.interestCoverage)} detail="EBIT ÷ interest expense"/><Metric label="FCF / debt" value={financialScreenNotApplicable ? "n/m" : percentageRatio(defaultRisk.ratios.fcfToDebt)} detail="Annual FCF relative to debt"/></div></section>
        </>}

        <div className="analysis-source-links">{analysis.filing && <a href={analysis.filing.url} target="_blank" rel="noreferrer">Open SEC filing ↗</a>}<a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces" target="_blank" rel="noreferrer">SEC API documentation ↗</a></div>
      </div>
    </details>

    <footer><span>THIS IS NOT FINANCIAL ADVICE</span><Link href={`/?symbol=${encodeURIComponent(data.company.symbol)}`}>Return to DCF Calculator →</Link></footer>
  </main>;
}
