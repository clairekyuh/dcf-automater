"use client";

import { useState } from "react";
import type { CompanyData, ComparableCompany, RiskItem } from "@/lib/company-data";
import { calculateDcf, calculateWacc, type DcfModel } from "@/lib/dcf-engine";

type DcfResult = ReturnType<typeof calculateDcf>;

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const pct2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const validMedian = (values: Array<number | null>) => {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const peerMedian = (
  data: CompanyData,
  key: keyof Pick<ComparableCompany, "marketCap" | "revenueGrowth" | "operatingMargin" | "evToRevenue" | "evToEbitda" | "pe">,
) => validMedian((data.comparison?.peers || []).map((peer) => peer[key]));

function businessFocus(company: Pick<ComparableCompany, "description" | "industry" | "sector" | "businessModel">) {
  if (company.businessModel) return company.businessModel;
  const text = `${company.industry} ${company.sector} ${company.description}`;
  const rules = [
    { match: /electronic design automation|semiconductor ip/i, label: "Chip-design software and IP" },
    { match: /cybersecurity|security software|network security/i, label: "Cybersecurity software" },
    { match: /ai[- ]native|ai cloud|cloud for ai|gpu.{0,30}(cloud|compute)|accelerated[- ]compute/i, label: "AI-native GPU cloud infrastructure" },
    { match: /cloud infrastructure|data center|compute.*cloud|cloud.*compute/i, label: "Cloud and compute infrastructure" },
    { match: /semiconductor/i, label: "Semiconductor products and IP" },
    { match: /software|saas|application/i, label: "Enterprise software and workflows" },
    { match: /bank|financial services/i, label: "Banking and financial services" },
    { match: /insurance/i, label: "Insurance underwriting" },
    { match: /biotech|pharma|therapeutic/i, label: "Medicines and life-science innovation" },
    { match: /automotive|vehicle|automobile/i, label: "Vehicles and mobility" },
    { match: /retail|consumer|restaurant/i, label: "Consumer products and distribution" },
    { match: /oil|gas|energy/i, label: "Energy production and infrastructure" },
    { match: /utility/i, label: "Regulated utility services" },
    { match: /industrial|manufactur|aerospace|defense/i, label: "Industrial products and services" },
  ];
  return rules.find((rule) => rule.match.test(text))?.label || company.industry || company.sector || "Diversified operations";
}
function businessAssessment(data: CompanyData, company: ComparableCompany) {
  const text = `${company.industry} ${company.description}`;
  const moatRules = [
    { match: /electronic design automation|semiconductor ip/i, score: 2, mechanism: "Specialized design tools can become embedded in customer workflows, creating switching costs and valuable technical IP.", verify: "customer retention, design-win duration, interoperability, and competitive tool performance" },
    { match: /semiconductor/i, score: 2, mechanism: "Proprietary architectures, engineering know-how, software ecosystems, and long design cycles can create durable advantages.", verify: "market share, performance leadership, customer concentration, and product-cycle durability" },
    { match: /ai[- ]native|ai cloud|cloud for ai|gpu.{0,30}(cloud|compute)|accelerated[- ]compute/i, score: 1, mechanism: "Early access to scarce GPUs, high-density infrastructure, orchestration software, and deployment expertise can create an execution advantage, but hardware cycles and well-funded hyperscalers can erode it.", verify: "GPU utilization, return on invested capital, hardware refresh costs, customer concentration, power access, and performance versus hyperscalers" },
    { match: /software|saas|application/i, score: 1, mechanism: "Software may develop switching costs when it is deeply integrated into daily workflows, data, and customer systems.", verify: "retention, recurring revenue, pricing power, implementation cost, and credible substitutes" },
    { match: /cloud infrastructure|data center|compute/i, score: 1, mechanism: "Scale, scarce infrastructure access, and engineering execution can help, although capital intensity and customer concentration can weaken the advantage.", verify: "utilization, unit economics, supplier access, customer concentration, and returns on invested capital" },
    { match: /retail|restaurant|consumer (?:product|brand|goods|electronics)/i, score: 1, mechanism: "Brand, distribution, customer habits, or purchasing scale can support an advantage, but those benefits are not automatic.", verify: "repeat purchasing, price premiums, store economics, and market-share stability" },
    { match: /bank|financial|payment/i, score: 1, mechanism: "Low-cost funding, trusted distribution, network effects, or regulatory scale may provide an advantage.", verify: "funding costs, customer retention, credit performance, and incremental returns on capital" },
    { match: /biotech|pharma|therapeutic/i, score: 1, mechanism: "Patents and clinical differentiation can create temporary exclusivity, but the advantage may expire or fail with the pipeline.", verify: "patent life, clinical outcomes, reimbursement, pipeline depth, and competing treatments" },
  ];
  const rule = moatRules.find((item) => item.match.test(text));
  const medianMargin = peerMedian(data, "operatingMargin");
  const marginPremium = company.operatingMargin !== null && medianMargin !== null ? company.operatingMargin - medianMargin : null;
  const verdict = rule ? "Potential advantage—requires evidence" : "No specific advantage identified";
  const financialSignal = marginPremium === null
    ? "Peer margin evidence was unavailable."
    : marginPremium > 3
      ? `Its operating margin is ${fmt.format(marginPremium)} percentage points above the peer median. That is context, not proof of pricing power or durability.`
      : marginPremium < -3
        ? `Its operating margin is ${fmt.format(Math.abs(marginPremium))} percentage points below the peer median, so the current numbers do not show peer-leading economics.`
        : "Its operating margin is close to the peer median, so the current numbers alone do not establish pricing power.";
  return {
    verdict,
    mechanism: rule?.mechanism || "The provider description and financial ratios do not reveal a specific durable competitive advantage.",
    verify: rule?.verify || "customer retention, pricing power, market share, returns on invested capital, and credible substitutes",
    financialSignal,
  };
}

export default function PitchDeck({
  data,
  businessDescription,
  model,
  perpetuity,
  multiple,
  risks,
  financialUnsupported,
}: {
  data: CompanyData;
  businessDescription: string;
  model: DcfModel;
  perpetuity: DcfResult;
  multiple: DcfResult;
  risks: RiskItem[];
  financialUnsupported: boolean;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const comparison = data.comparison;
  const company = comparison?.company || {
    symbol: data.company.symbol,
    name: data.company.name,
    description: data.company.description,
    sector: data.company.sector,
    industry: data.company.industry,
    marketCap: data.market.marketCap,
    revenueGrowth: data.metrics.revenueGrowth,
    operatingMargin: data.metrics.ebitMargin,
    evToRevenue: null,
    evToEbitda: null,
    pe: null,
  };
  const assessment = businessAssessment(data, company);
  const medianGrowth = peerMedian(data, "revenueGrowth");
  const medianMargin = peerMedian(data, "operatingMargin");
  const medianMultiple = peerMedian(data, financialUnsupported ? "pe" : "evToEbitda");
  const recentHistory = data.historical.slice(-3);
  const maxRevenue = Math.max(...recentHistory.map((row) => row.revenue), 1);
  const validValues = [perpetuity.valid ? perpetuity.perShare : null, multiple.valid ? multiple.perShare : null]
    .filter((value): value is number => value !== null);
  const lowValue = validValues.length ? Math.min(...validValues) : null;
  const highValue = validValues.length ? Math.max(...validValues) : null;
  const printDeck = () => {
    document.body.classList.add("printing-pitch");
    const cleanup = () => document.body.classList.remove("printing-pitch");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1_500);
  };
  const slides = [
    <article className="pitch-slide pitch-cover" key="cover">
      <div><span>Company valuation brief</span><h3>{data.company.name}</h3><p>{data.company.symbol} · {data.company.exchange} · {data.company.country}</p></div>
      <div className="pitch-cover-number"><strong>{usd.format(model.marketPrice)}</strong><small>Market-price input</small></div>
      <footer><span>Valuation date · {model.valuationDate}</span><span>Educational scenario analysis</span></footer>
    </article>,
    <article className="pitch-slide" key="business">
      <header><span>01 · BUSINESS</span><h3>{comparison?.nicheLabel || businessFocus(company)}</h3></header>
      <div className="pitch-two-column"><div><h4>What the company does</h4><p>{businessDescription}</p></div><div><h4>Competitive position</h4><strong>{assessment.verdict}</strong><p>{assessment.mechanism}</p></div></div>
      <footer><span>Verify: {assessment.verify}</span><span>{data.company.industry}</span></footer>
    </article>,
    <article className="pitch-slide" key="operations">
      <header><span>02 · OPERATING PROFILE</span><h3>Historical growth and operating margins</h3></header>
      <div className="pitch-operating-grid"><div className="pitch-revenue-bars"><h4>Reported revenue</h4>{recentHistory.map((row) => <div key={row.year}><span>{row.year}</span><i><b style={{ width: `${row.revenue / maxRevenue * 100}%` }}/></i><strong>{usd0.format(row.revenue)}M</strong></div>)}</div><div className="pitch-metric-stack"><p><span>LATEST REVENUE GROWTH</span><strong>{fmt.format(data.metrics.revenueGrowth)}%</strong></p><p><span>OPERATING MARGIN</span><strong>{fmt.format(data.metrics.ebitMargin)}%</strong></p><p><span>CAPEX / REVENUE</span><strong>{fmt.format(data.metrics.capexPercentRevenue)}%</strong></p></div></div>
      <footer><span>Financials through {data.asOf}</span><span>{data.source}</span></footer>
    </article>,
    <article className="pitch-slide" key="valuation">
      <header><span>03 · INTRINSIC VALUE</span><h3>{financialUnsupported ? "A standard corporate DCF is not appropriate for this sector" : "The two terminal methods define a range—not a price target"}</h3></header>
      {financialUnsupported ? <div className="pitch-message"><strong>Use sector-specific valuation</strong><p>Review tangible book value, return on equity, regulatory capital, asset quality, funding costs, and dividends or residual income.</p></div> : <><div className="pitch-value-range"><div><span>MARKET PRICE</span><strong>{usd.format(model.marketPrice)}</strong></div><div><span>PERPETUAL GROWTH</span><strong>{perpetuity.valid ? usd.format(perpetuity.perShare) : "—"}</strong></div><div><span>EXIT MULTIPLE</span><strong>{multiple.valid ? usd.format(multiple.perShare) : "—"}</strong></div></div><p className="pitch-takeaway">Automated scenario range: <b>{lowValue === null || highValue === null ? "Unavailable" : `${usd.format(lowValue)}–${usd.format(highValue)}`}</b>. Reconcile the methods before drawing an investment conclusion.</p></>}
      <footer><span>WACC {pct2.format(calculateWacc(model).selectedWacc)}% · Terminal growth {fmt.format(model.terminalGrowth)}%</span><span>Scenario values only</span></footer>
    </article>,
    <article className="pitch-slide" key="comps">
      <header><span>04 · COMPARABLE COMPANIES</span><h3>Business-model fit matters more than the reported industry label</h3></header>
      <div className="pitch-comps-grid"><div><span>FOCUS COMPANY</span><strong>{data.company.symbol}</strong><small>{comparison?.nicheLabel || data.company.industry}</small></div><div><span>PEER MEDIAN GROWTH</span><strong>{medianGrowth === null ? "—" : `${fmt.format(medianGrowth)}%`}</strong><small>Latest annual period</small></div><div><span>PEER MEDIAN MARGIN</span><strong>{medianMargin === null ? "—" : `${fmt.format(medianMargin)}%`}</strong><small>Operating margin</small></div><div><span>PEER MEDIAN {financialUnsupported ? "P / E" : "EV / EBITDA"}</span><strong>{medianMultiple === null ? "—" : `${fmt.format(medianMultiple)}×`}</strong><small>Current price / latest annuals</small></div></div>
      <p className="pitch-peer-list">Selected peers · {(comparison?.selectedPeerSymbols || comparison?.peers.map((peer) => peer.symbol) || []).join(" · ") || "No validated peer set returned"}</p>
      <footer><span>Use forward, fiscal-aligned multiples for final work</span><span>Peer data may be incomplete</span></footer>
    </article>,
    <article className="pitch-slide" key="risks">
      <header><span>05 · RISK REVIEW</span><h3>The investment case depends on resolving the largest uncertainties</h3></header>
      <div className="pitch-risk-list">{risks.slice(0, 3).map((risk, index) => <div key={risk.title}><span>{String(index + 1).padStart(2, "0")} · {risk.level.toUpperCase()}</span><h4>{risk.title}</h4><p>{risk.detail}</p></div>)}</div>
      <footer><span>Review company filings and management guidance</span><span>Risks can affect cash flow and WACC</span></footer>
    </article>,
    <article className="pitch-slide" key="conclusion">
      <header><span>06 · DECISION FRAME</span><h3>The model identifies what must be true before capital is committed</h3></header>
      <div className="pitch-conclusion"><div><h4>Evidence to establish</h4><ul><li>Revenue growth and margins can coexist at the modeled scale.</li><li>Reinvestment produces returns above the cost of capital.</li><li>Debt, dilution, and refinancing remain manageable.</li></ul></div><div><h4>Model limitations</h4><ul><li>Later forecast years are automated estimates.</li><li>Peer multiples may not be forward or fiscal-aligned.</li><li>Missing or delayed source data can change the result.</li></ul></div></div>
      <p className="pitch-disclaimer">This deck is educational decision support. It is not personalized investment advice or an analyst price target.</p>
      <footer><span>{data.company.symbol} · {model.valuationDate}</span><span>Sources disclosed in the calculator</span></footer>
    </article>,
  ];
  return <div className="pitch-deck">
    <div className="deck-toolbar"><div><span>PITCH DECK</span><b>{activeSlide + 1} / {slides.length}</b></div><div><button type="button" onClick={() => setActiveSlide((current) => Math.max(0, current - 1))} disabled={activeSlide === 0}>← Previous</button><button type="button" onClick={() => setActiveSlide((current) => Math.min(slides.length - 1, current + 1))} disabled={activeSlide === slides.length - 1}>Next →</button><button type="button" className="deck-export" onClick={printDeck}>Print / Save PDF</button></div></div>
    <div className="deck-stage">{slides.map((slide, index) => <div className={index === activeSlide ? "active" : ""} key={slide.key}>{slide}</div>)}</div>
    <div className="deck-thumbnails" role="tablist" aria-label="Pitch deck slides">{["Cover", "Business", "Operations", "Valuation", "Comps", "Risks", "Decision"].map((label, index) => <button type="button" role="tab" aria-selected={activeSlide === index} className={activeSlide === index ? "active" : ""} key={label} onClick={() => setActiveSlide(index)}><span>{String(index + 1).padStart(2, "0")}</span>{label}</button>)}</div>
  </div>;
}
