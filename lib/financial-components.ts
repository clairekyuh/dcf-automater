type Available = number | null | undefined;
const present = (value: Available): value is number => typeof value === "number" && Number.isFinite(value);
const sumKnown = (values: Available[]) => values.some(present) ? values.filter(present).reduce((sum, value) => sum + value, 0) : null;

/** Short-term borrowings is an aggregate: do not also add its commercial-paper component. */
export function fundedDebt(parts: { currentTerm?: Available; shortBorrowings?: Available; commercialPaper?: Available; noncurrentTerm?: Available; totalTerm?: Available }) {
  const shortFunding = present(parts.shortBorrowings) ? parts.shortBorrowings : parts.commercialPaper;
  const currentTerm = present(parts.currentTerm) ? parts.currentTerm : present(parts.totalTerm) && present(parts.noncurrentTerm) ? parts.totalTerm - parts.noncurrentTerm : null;
  const current = sumKnown([currentTerm, shortFunding]);
  const term = present(parts.totalTerm) ? parts.totalTerm : sumKnown([currentTerm, parts.noncurrentTerm]);
  const total = present(currentTerm) && present(parts.noncurrentTerm)
    ? currentTerm + parts.noncurrentTerm + (shortFunding ?? 0)
    : present(term) ? term + (shortFunding ?? 0) : sumKnown([current, parts.noncurrentTerm]);
  const noncurrent = present(parts.noncurrentTerm) ? parts.noncurrentTerm : present(total) && present(current) ? Math.max(0, total - current) : null;
  return { current, noncurrent, total, components: { ...parts, shortFunding: shortFunding ?? null } };
}

export function observationStale(retrievedAt: string | undefined, now = Date.now(), maxAgeMs = 60 * 60 * 1000) {
  const timestamp = Date.parse(retrievedAt || "");
  return !Number.isFinite(timestamp) || now - timestamp >= maxAgeMs || timestamp > now + 60_000;
}
