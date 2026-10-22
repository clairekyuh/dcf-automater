"use client";

import { useState, type MouseEvent } from "react";
import styles from "./company-navigation.module.css";

export type CompanyNavView = "model" | "company" | "price" | "news" | "risks";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const links: Array<{ view: CompanyNavView; label: string; path: string; href: string }> = [
    { view: "model", label: "DCF model", path: "/", href: companyHref("/", symbol) },
    { view: "company", label: "Company analysis", path: "/company-analysis", href: companyHref("/company-analysis", symbol) },
    { view: "price", label: "Stock price", path: "/stock-price", href: companyHref("/stock-price", symbol) },
    { view: "news", label: "News", path: "/news", href: companyHref("/news", symbol) },
    { view: "risks", label: "Risks", path: "/risks", href: companyHref("/risks", symbol) },
  ];
  const navigate = (event: MouseEvent<HTMLAnchorElement>, view: CompanyNavView, path: string) => {
    const requested = symbol || new URLSearchParams(window.location.search).get("symbol")?.trim().toUpperCase();
    if (requested && /^[A-Z0-9.\-]{1,12}$/.test(requested)) event.currentTarget.href = companyHref(path, requested);
    setMenuOpen(false);
    onViewChange?.(view);
  };
  return <nav className={styles.navigation} aria-label="Company workspace">
    <button className={styles.menuButton} type="button" aria-expanded={menuOpen} aria-controls="company-navigation-links" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "Close" : "Menu"}</button>
    <div className={`${styles.links} ${menuOpen ? styles.open : ""}`} id="company-navigation-links">
      {links.map((link) => <a
        href={link.href}
        className={active === link.view ? styles.active : ""}
        aria-current={active === link.view ? "page" : undefined}
        key={link.view}
        onClick={(event) => navigate(event, link.view, link.path)}
      >{link.label}</a>)}
    </div>
    <div className={styles.status} title={name || "Load a ticker in the DCF model"} aria-label={name || symbol ? `${symbol || ""} ${name || ""}`.trim() : "No company selected"}>
      <b>{symbol || "No ticker"}</b>{name && <span>{name}</span>}
    </div>
  </nav>;
}
