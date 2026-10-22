import type { CompanyData } from "@/lib/company-data";
import { observationStale } from "@/lib/financial-components";
import { isCompanyData, readManualPeers, saveManualPeers, withManualPeers } from "@/lib/client/company-storage";

export const companyDataStale = (data: CompanyData | null) => !data || observationStale(data.retrievedAt);

export async function refreshManualPeers(data: CompanyData, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<CompanyData> {
  const manual = readManualPeers(data.company.symbol);
  if (!manual.length) return data;
  const refreshed = await Promise.all(manual.map(async (peer) => {
    if (!options.force && !observationStale(peer.retrievedAt)) return peer;
    try {
      const response = await fetch(`/api/company?symbol=${encodeURIComponent(peer.symbol)}&view=valuation`, { signal: options.signal, cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok || !isCompanyData(payload) || payload.company.symbol !== peer.symbol || !payload.comparison) return peer;
      return { ...payload.comparison.company, manualAdded: true, peerFit: undefined, peerRationale: peer.peerRationale };
    } catch { return peer; }
  }));
  if (!options.signal?.aborted) {
    const updates = new Map(refreshed.map((peer) => [peer.symbol, peer]));
    const current = readManualPeers(data.company.symbol);
    saveManualPeers(data.company.symbol, current.map((peer) => updates.get(peer.symbol) || peer));
  }
  return withManualPeers(data);
}
