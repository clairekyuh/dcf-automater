"use client";

import { useEffect, useRef } from "react";
import type { DcfReliability } from "@/lib/dcf-reliability";
import styles from "./dcf-dashboard.module.css";

export default function DcfWarningDialog({ warning, onDismiss }: { warning: DcfReliability; onDismiss: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  return <div className={styles.warningBackdrop}>
    <section
      className={`${styles.warningDialog} ${warning.level === "blocked" ? styles.warningDialogBlocked : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dcf-warning-title"
      aria-describedby="dcf-warning-summary"
    >
      <div className={styles.warningHeader}>
        <div className={styles.warningSymbol} aria-hidden="true">!</div>
        <div>
          <h2 id="dcf-warning-title">{warning.title}</h2>
          <p id="dcf-warning-summary">{warning.summary}</p>
        </div>
        <button ref={closeButton} className={styles.warningClose} type="button" onClick={onDismiss} aria-label="Dismiss warning">×</button>
      </div>
      <div className={styles.warningRisks}>
        {warning.reasons.map((reason) => <div key={reason.label}>
          <h3>{reason.label}</h3>
          <p>{reason.detail}</p>
        </div>)}
      </div>
      <div className={styles.warningFooter}>
        <button type="button" onClick={onDismiss}>Continue</button>
      </div>
    </section>
  </div>;
}
