export type TreasuryObservation = {
  asOf: string;
  rate: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function latestTreasuryObservation(csv: string): TreasuryObservation | null {
  const rows = csv.trim().split(/\r?\n/).slice(1);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const columns = rows[index].split(",").map((column) => column.trim());
    if (columns.length !== 2 || !ISO_DATE.test(columns[0])) continue;

    const rate = Number(columns[1]);
    if (!Number.isFinite(rate) || rate < -5 || rate > 30) continue;

    const timestamp = Date.parse(`${columns[0]}T00:00:00Z`);
    if (!Number.isFinite(timestamp)) continue;
    return { asOf: columns[0], rate };
  }
  return null;
}
