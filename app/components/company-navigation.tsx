"use client";

import Link from "next/link";

export type CompanyNavView = "model" | "company" | "credit" | "price" | "news" | "risks";

function companyHref(path: string, symbol?: string) {
  return `${path}${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`;
}

export default function CompanyNavigation({
  symbol,
  name,
  active,
}: {
  symbol?: string;
  name?: string;
  active: CompanyNavView;
}) {
  const links: Array<{ view: CompanyNavView; label: string; href: string }> = [
    { view: "model", label: "DCF model", href: companyHref("/", symbol) },
    { view: "company", label: "Company analysis", href: companyHref("/company-analysis", symbol) },
    { view: "credit", label: "Credit screen", href: `${companyHref("/company-analysis", symbol)}#credit-screen` },
    { view: "price", label: "Stock price", href: companyHref("/stock-price", symbol) },
    { view: "news", label: "News", href: companyHref("/news", symbol) },
    { view: "risks", label: "Risks", href: companyHref("/risks", symbol) },
  ];

  return <nav className="top-nav company-nav" aria-label="Company workspace">
    <Link href={companyHref("/", symbol)} className="brand" aria-label="Open DCF model"><b>DCF</b></Link>
    <div className="company-nav-links">
      {links.map((link) => <Link
        href={link.href}
        className={active === link.view ? "active" : ""}
        aria-current={active === link.view ? "page" : undefined}
        key={link.view}
      >{link.label}</Link>)}
    </div>
    <div className="company-nav-context" title={name || "Load a ticker in the DCF model"}>
      <span>COMPANY</span><b>{symbol || "NO TICKER"}</b>{name && <small>{name}</small>}
    </div>
  </nav>;
}
