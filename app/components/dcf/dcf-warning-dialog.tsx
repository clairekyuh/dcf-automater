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
    >
      <div className={styles.warningHeader}>
        <h2 id="dcf-warning-title">{warning.title}</h2>
        <button ref={closeButton} className={styles.warningClose} type="button" onClick={onDismiss} aria-label="Dismiss warning">×</button>
      </div>
      <ul className={styles.warningRisks}>
        {warning.reasons.map((reason) => <li key={reason.label}>
          <strong>{reason.label}</strong>{reason.detail ? `: ${reason.detail}` : ""}
        </li>)}
      </ul>
    </section>
  </div>;
}
