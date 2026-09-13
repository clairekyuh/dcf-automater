import styles from "./dcf-dashboard.module.css";

export default function DcfSummarySkeleton({ symbol }: { symbol: string }) {
  return (
    <section className={styles.loadingSummary} aria-busy="true" aria-live="polite">
      <div className={styles.loadingStatus}>
        <span className={styles.loadingPulse} aria-hidden="true" />
        Loading market data for {symbol}
      </div>

      <div className={styles.loadingCompanyRow}>
        <div>
          <span className={`${styles.skeletonLine} ${styles.skeletonEyebrow}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonCompany}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonDescription}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonDescriptionShort}`} />
        </div>
        <div className={styles.loadingPrice}>
          <span>Current market price</span>
          <span className={`${styles.skeletonLine} ${styles.skeletonValue}`} />
        </div>
      </div>

      <div className={styles.loadingMethods}>
        {["Perpetual growth", "Exit multiple"].map((method) => (
          <div key={method}>
            <span>{method}</span>
            <span className={`${styles.skeletonLine} ${styles.skeletonValue}`} />
          </div>
        ))}
      </div>

      <div className={styles.loadingAssumptions} aria-label="Loading DCF assumptions">
        {["WACC", "Long-term growth", "Exit multiple", "Forecast period"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </section>
  );
}
