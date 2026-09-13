"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CompanyNavigation, { type CompanyNavView } from "@/app/components/company-navigation";
import CompanyNews from "@/app/components/company-news";
import StockPriceChart from "@/app/components/stock-price-chart";
import { readCompanyData, readResearchData, storeCompanyData } from "@/lib/client/company-storage";
import { apiErrorMessage } from "@/lib/client/api-error";
import type { CompanyData, RiskItem } from "@/lib/company-data";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const longDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const riskAssumption = (title: string) => /capital/i.test(title) ? "Capex and free cash flow" : /leverage|debt|credit/i.test(title) ? "WACC and equity bridge" : /margin/i.test(title) ? "EBIT margin" : /customer|supplier|supply/i.test(title) ? "Revenue and operating margin" : /terminal/i.test(title) ? "Terminal value" : "Company forecast";
const riskDirection = (title: string) => /leverage|debt|credit/i.test(title) ? "Higher discount rate or lower equity value" : /capital|margin|customer|supplier|supply/i.test(title) ? "Lower forecast cash flow" : /terminal/i.test(title) ? "Lower terminal value" : "Review forecast assumptions";

function baselineRisks(data: CompanyData): RiskItem[] {
  const capex = data.metrics.capexPercentRevenue;
  const leverage = data.metrics.debt / Math.max(data.metrics.revenue, 1);
  const margins = data.historical.map((row) => row.ebitMargin).filter(Number.isFinite);
  const marginSpread = margins.length > 1 ? Math.max(...margins) - Math.min(...margins) : null;
  const filingSignals = (data.businessAnalysis?.supplyChain?.signals || []).slice(0, 3);
  return [
    { level: capex > 12 ? "high" : capex > 6 ? "medium" : "low", title: "Capital intensity", detail: `${fmt.format(capex)}% of latest revenue was spent on capex. High reinvestment can prevent operating profit from becoming distributable cash.` },
    { level: leverage > 1 ? "high" : leverage > .45 ? "medium" : "low", title: "Balance-sheet leverage", detail: `Debt equals ${fmt.format(leverage * 100)}% of annual revenue. Review maturities, covenants, refinancing access, and interest costs in the latest filing.` },
    { level: marginSpread === null ? "medium" : marginSpread > 15 ? "high" : marginSpread > 7 ? "medium" : "low", title: "Operating-margin consistency", detail: marginSpread === null ? "There is not enough historical margin data to judge stability." : `Reported EBIT margin moved across a ${fmt.format(marginSpread)} percentage-point range. Larger swings make cash-flow forecasts less dependable.` },
    ...filingSignals,
  ];
}

export default function CompanyResearchPage({ view }: { view: "price" | "news" | "risks" }) {
  const [data, setData] = useState<CompanyData | null>(null);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      const requested = new URLSearchParams(window.location.search).get("symbol")?.trim().toUpperCase();
      const cached = readCompanyData(requested);
      if (cached) {
        setData(cached);
        setRisks(readResearchData(cached.company.symbol)?.risks || baselineRisks(cached));
        setLoading(false);
        return;
      }
      if (!requested || !/^[A-Z0-9.\-]{1,12}$/.test(requested)) {
        setError("Load a ticker in the DCF model first.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/company?symbol=${encodeURIComponent(requested)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(payload, "Unable to load this company."));
        const company = payload as CompanyData;
        if (controller.signal.aborted) return;
        storeCompanyData(company);
        setData(company);
        setRisks(baselineRisks(company));
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load this company.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  const active = view as CompanyNavView;
  if (!data) return <main className="company-view-page"><CompanyNavigation active={active}/><section className="company-view-missing"><span>{view.toUpperCase()}</span><h1>{loading ? "Loading company…" : "Company not loaded"}</h1><p>{error || "Open the DCF model and enter a ticker first."}</p><Link href="/">Open DCF model →</Link></section></main>;

  const intro = view === "price"
    ? { eyebrow: "Market data", title: "Stock price", detail: data.source === "Sample data" ? "Illustrative price history." : data.company.ipoDate ? `${data.company.name} first traded publicly on ${longDate(data.company.ipoDate)}.` : `A reliable public-market debut date was not available for ${data.company.name}.` }
    : view === "news"
      ? { eyebrow: "Recent events", title: "Company news", detail: "Company-specific headlines screened for possible relevance to the DCF." }
      : { eyebrow: "Risk review", title: "Potential risks", detail: "Evidence and model sensitivities to check before relying on the valuation." };

  return <main className="company-view-page">
    <CompanyNavigation symbol={data.company.symbol} name={data.company.name} active={active}/>
    <header className="company-view-header"><div><span>{intro.eyebrow}</span><h1>{intro.title}</h1><p>{intro.detail}</p></div><aside><strong>{data.company.name}</strong><small>{data.company.symbol} · {data.company.exchange} · {data.company.industry}</small></aside></header>
    {view === "price" && <section className="company-view-panel"><StockPriceChart points={data.market.priceHistory || []} symbol={data.company.symbol}/></section>}
    {view === "news" && <div className="company-view-news"><CompanyNews symbol={data.company.symbol} name={data.company.name} showHeading={false}/></div>}
    {view === "risks" && <section className="company-view-panel risk-register"><div className="risk-register-head"><span>Severity</span><span>Risk and evidence</span><span>DCF assumption affected</span><span>Potential impact</span></div><div className="risk-grid">{risks.map((risk) => <article key={risk.title}><span className={`risk-pill ${risk.level}`}>{risk.level}</span><div><h3>{risk.title}</h3><p>{risk.detail}</p></div><strong>{riskAssumption(risk.title)}</strong><small>{riskDirection(risk.title)}</small></article>)}</div><p className="risk-source">Model screen based on available company financials and filing signals as of {data.asOf || "the latest displayed data date"}. Review the underlying filing before changing assumptions.</p><div className="financial-advice-banner">THIS IS NOT FINANCIAL ADVICE</div></section>}
    <footer><span>Educational decision support only—not personalized investment advice.</span><a href={`/?symbol=${encodeURIComponent(data.company.symbol)}`}>Return to DCF model →</a></footer>
  </main>;
}
