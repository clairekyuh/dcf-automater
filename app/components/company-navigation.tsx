"use client";

import Link from "next/link";
import { useState } from "react";
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
  const links: Array<{ view: CompanyNavView; label: string; href: string }> = [
    { view: "model", label: "DCF model", href: companyHref("/", symbol) },
    { view: "company", label: "Company analysis", href: companyHref("/company-analysis", symbol) },
    { view: "price", label: "Stock price", href: companyHref("/stock-price", symbol) },
    { view: "news", label: "News", href: companyHref("/news", symbol) },
    { view: "risks", label: "Risks", href: companyHref("/risks", symbol) },
  ];
  return <nav className={styles.navigation} aria-label="Company workspace">
    <button className={styles.menuButton} type="button" aria-expanded={menuOpen} aria-controls="company-navigation-links" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "Close" : "Menu"}</button>
    <div className={`${styles.links} ${menuOpen ? styles.open : ""}`} id="company-navigation-links">
      {links.map((link) => <Link
        href={link.href}
        className={active === link.view ? styles.active : ""}
        aria-current={active === link.view ? "page" : undefined}
        key={link.view}
        onClick={() => { setMenuOpen(false); onViewChange?.(link.view); }}
      >{link.label}</Link>)}
    </div>
    <div className={styles.status} title={name || "Load a ticker in the DCF model"} aria-label={name || symbol ? `${symbol || ""} ${name || ""}`.trim() : "No company selected"}>
      <b>{symbol || "No ticker"}</b>{name && <span>{name}</span>}
    </div>
  </nav>;
}
