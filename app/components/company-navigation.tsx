"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";

export type CompanyNavView = "model" | "company" | "credit" | "price" | "news" | "risks";

function companyHref(path: string, symbol?: string) {
  return `${path}${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`;
}

export default function CompanyNavigation({
  symbol,
  name,
  active,
  onViewChange,
}: {
  symbol?: string;
  name?: string;
  active: CompanyNavView;
  onViewChange?: (view: CompanyNavView) => void;
}) {
  const router = useRouter();
  const [transition, setTransition] = useState<{ key: number; mode: "soft" | "model" } | null>(null);
  const links: Array<{ view: CompanyNavView; label: string; href: string }> = [
    { view: "model", label: "DCF model", href: companyHref("/", symbol) },
    { view: "company", label: "Company analysis", href: companyHref("/company-analysis", symbol) },
    { view: "credit", label: "Credit screen", href: `${companyHref("/company-analysis", symbol)}#credit-screen` },
    { view: "price", label: "Stock price", href: companyHref("/stock-price", symbol) },
    { view: "news", label: "News", href: companyHref("/news", symbol) },
    { view: "risks", label: "Risks", href: companyHref("/risks", symbol) },
  ];
  const navigate = (event: MouseEvent<HTMLAnchorElement>, view: CompanyNavView, href: string) => {
    if (view === active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onViewChange?.(view);
      router.push(href);
      return;
    }
    const mode = view === "model" ? "model" : "soft";
    onViewChange?.(view);
    setTransition((current) => ({ key: (current?.key || 0) + 1, mode }));
    window.setTimeout(() => router.push(href), mode === "model" ? 300 : 180);
  };

  return <><nav className="top-nav company-nav" aria-label="Company workspace">
    <div className="company-nav-links">
      {links.map((link) => <Link
        href={link.href}
        className={active === link.view ? "active" : ""}
        aria-current={active === link.view ? "page" : undefined}
        key={link.view}
        onClick={(event) => navigate(event, link.view, link.href)}
      >{link.label}</Link>)}
    </div>
    <div className="company-nav-context" title={name || "Load a ticker in the DCF model"}>
      <span>COMPANY</span><b>{symbol || "NO TICKER"}</b>{name && <small>{name}</small>}
    </div>
  </nav>{transition && <div className={`company-route-transition ${transition.mode === "model" ? "model-return" : ""}`} key={transition.key} aria-hidden="true"><i/></div>}</>;
}
