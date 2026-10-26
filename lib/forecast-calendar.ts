import { addYears } from "@/lib/dcf-engine";

/** Number of completed forecast fiscal years between the latest actual and valuation date. */
export function completedForecastYears(latestFiscalEnd: string, valuationDate: string, maximum = 20) {
  let completed = 0;
  while (completed < maximum && addYears(latestFiscalEnd, completed + 1) <= valuationDate) completed += 1;
  return completed;
}
