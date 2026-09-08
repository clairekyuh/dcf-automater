"use client";

import { useEffect, useState } from "react";
import CompanyNavigation, { type CompanyNavView } from "@/app/components/company-navigation";
import CompanyNews from "@/app/components/company-news";
import StockPriceChart, { type PricePoint } from "@/app/components/stock-price-chart";

type RiskItem = { level: "high" | "medium" | "low"; title: string; detail: string };
type ResearchCompany = {
  source: string;
  asOf: string;
  company: { symbol: string; name: string; description: string; ipoDate?: string | null; exchange: string; country: string; sector: string; industry: string };
  market: { priceHistory?: PricePoint[] };
  metrics: { revenue: number; debt: number; capexPercentRevenue: number; ebitMargin: number };
  historical: Array<{ year: string; ebitMargin: number }>;
  businessAnalysis?: { supplyChain?: { signals?: RiskItem[]; filingReviewed?: boolean } };
};

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const longDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

function baselineRisks(data: ResearchCompany): RiskItem[] {
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

function storedCompany(requested?: string) {
  const raw = sessionStorage.getItem("dcf:last-company") || localStorage.getItem("dcf:last-company");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ResearchCompany;
    return !requested || parsed.company.symbol === requested ? parsed : null;
  } catch {
    return null;
  }
}

function storedRisks(symbol: string) {
  const raw = sessionStorage.getItem("dcf:last-research") || localStorage.getItem("dcf:last-research");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { symbol: string; risks: RiskItem[] };
    return parsed.symbol === symbol && Array.isArray(parsed.risks) ? parsed.risks : null;
  } catch {
    return null;
  }
}

export default function CompanyResearchPage({ view }: { view: "price" | "news" | "risks" }) {
  const [data, setData] = useState<ResearchCompany | null>(null);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("symbol")?.trim().toUpperCase();
    const cached = storedCompany(requested);
    if (cached) {
      setData(cached);
      setRisks(storedRisks(cached.company.symbol) || baselineRisks(cached));
      setLoading(false);
      return;
    }
    if (!requested || !/^[A-Z0-9.\-]{1,12}$/.test(requested)) {
      setError("Load a ticker in the DCF model first.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/company?symbol=${encodeURIComponent(requested)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load this company.");
        return payload as ResearchCompany;
      })
      .then((company) => {
        const serialized = JSON.stringify(company);
        sessionStorage.setItem("dcf:last-company", serialized);
        localStorage.setItem("dcf:last-company", serialized);
        setData(company);
        setRisks(baselineRisks(company));
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Unable to load this company.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const active = view as CompanyNavView;
  if (!data) return <main className="company-view-page"><CompanyNavigation active={active}/><section className="company-view-missing"><span>{view.toUpperCase()}</span><h1>{loading ? "Loading company…" : "Company not loaded"}</h1><p>{error || "Open the DCF model and enter a ticker first."}</p><a href="/">Open DCF model →</a></section></main>;

  const intro = view === "price"
    ? { eyebrow: "MARKET DATA", title: "Stock price history", detail: data.source === "Sample data" ? "Illustrative price history." : data.company.ipoDate ? `${data.company.name} first traded publicly on ${longDate(data.company.ipoDate)}.` : `A reliable public-market debut date was not available for ${data.company.name}.` }
    : view === "news"
      ? { eyebrow: "RECENT EVENTS", title: "Company news", detail: "Recent company-specific headlines and their possible connection to the DCF." }
      : { eyebrow: "RISK REVIEW", title: "Potential risks", detail: "Evidence and model sensitivities that should be checked before relying on the valuation." };

  return <main className="company-view-page">
    <CompanyNavigation symbol={data.company.symbol} name={data.company.name} active={active}/>
    <header className="company-view-header"><div><span>{intro.eyebrow}</span><h1>{intro.title}</h1><p>{intro.detail}</p></div><aside><span>COMPANY</span><strong>{data.company.name}</strong><small>{data.company.symbol} · {data.company.exchange} · {data.company.industry}</small></aside></header>
    {view === "price" && <section className="company-view-panel"><StockPriceChart points={data.market.priceHistory || []} symbol={data.company.symbol}/></section>}
    {view === "news" && <div className="company-view-news"><CompanyNews symbol={data.company.symbol} name={data.company.name} showHeading={false}/></div>}
    {view === "risks" && <section className="company-view-panel"><div className="risk-grid">{risks.map((risk) => <article key={risk.title}><span className={`risk-pill ${risk.level}`}>{risk.level}</span><h3>{risk.title}</h3><p>{risk.detail}</p></article>)}</div><div className="financial-advice-banner">THIS IS NOT FINANCIAL ADVICE</div></section>}
    <footer><span>Educational decision support only—not personalized investment advice.</span><a href={`/?symbol=${encodeURIComponent(data.company.symbol)}`}>Return to DCF model →</a></footer>
  </main>;
}
