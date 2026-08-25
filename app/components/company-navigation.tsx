"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();
  const [transitionKey, setTransitionKey] = useState(0);
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
        onClick={(event) => {
          if (link.view === "model" || link.view === active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setTransitionKey((current) => current + 1);
          window.setTimeout(() => router.push(link.href), 180);
        }}
      >{link.label}</Link>)}
    </div>
    <div className="company-nav-context" title={name || "Load a ticker in the DCF model"}>
      <span>COMPANY</span><b>{symbol || "NO TICKER"}</b>{name && <small>{name}</small>}
    </div>
    {transitionKey > 0 && <div className="company-route-transition" key={transitionKey} aria-hidden="true"><i/></div>}
  </nav>;
}
