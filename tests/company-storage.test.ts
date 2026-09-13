import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_STORAGE_KEY,
  COMPANY_STORAGE_VERSION,
  MAX_COMPANY_STORAGE_CHARS,
  RESEARCH_STORAGE_KEY,
  readCompanyData,
  readResearchData,
  storeCompanyData,
  storeResearchData,
  type StorageLike,
} from "../lib/client/company-storage";
import type { CompanyData } from "../lib/company-data";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("Storage unavailable");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

function company(): CompanyData {
  return {
    source: "Test source",
    asOf: "2026-06-30",
    company: {
      symbol: "AAPL", name: "Apple", description: "Makes devices and services.", exchange: "NASDAQ",
      currency: "USD", country: "United States", sector: "Technology", industry: "Consumer Electronics",
    },
    market: { marketCap: 3_000_000, shares: 15_000, estimatedPrice: 200, beta: 1.1, priceHistory: [{ date: "2026-06-30", close: 200 }] },
    metrics: {
      revenueGrowth: 5, revenue: 400_000, ebitMargin: 30, capexPercentRevenue: 3, daPercentRevenue: 3,
      cash: 60_000, debt: 100_000, taxRate: 16,
    },
    historical: [{
      year: "2025", revenue: 400_000, ebit: 120_000, ebitMargin: 30, operatingCashFlow: 130_000,
      capex: 12_000, capexPercentRevenue: 3, depreciation: 12_000, freeCashFlow: 118_000,
    }],
  };
}

test("company storage writes one versioned copy and reads it after runtime validation", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  session.setItem(COMPANY_STORAGE_KEY, "stale");
  assert.equal(storeCompanyData(company(), { local, session }), true);
  assert.equal(session.getItem(COMPANY_STORAGE_KEY), null);
  const raw = local.getItem(COMPANY_STORAGE_KEY)!;
  assert.equal(JSON.parse(raw).version, COMPANY_STORAGE_VERSION);
  assert.equal(readCompanyData("AAPL", { local, session })?.company.name, "Apple");
  assert.equal(readCompanyData("MSFT", { local, session }), null);
});

test("legacy company payloads are accepted only when valid and migrated to an envelope", () => {
  const local = new MemoryStorage();
  local.setItem(COMPANY_STORAGE_KEY, JSON.stringify(company()));
  assert.equal(readCompanyData("AAPL", { local })?.company.symbol, "AAPL");
  assert.equal(JSON.parse(local.getItem(COMPANY_STORAGE_KEY)!).kind, "company");
});

test("malformed and oversized company payloads are rejected and removed", () => {
  const invalid = new MemoryStorage();
  invalid.setItem(COMPANY_STORAGE_KEY, JSON.stringify({ company: { symbol: "AAPL" } }));
  assert.equal(readCompanyData(undefined, { local: invalid }), null);
  assert.equal(invalid.getItem(COMPANY_STORAGE_KEY), null);

  const oversized = new MemoryStorage();
  oversized.setItem(COMPANY_STORAGE_KEY, "x".repeat(MAX_COMPANY_STORAGE_CHARS + 1));
  assert.equal(readCompanyData(undefined, { local: oversized }), null);
  assert.equal(oversized.getItem(COMPANY_STORAGE_KEY), null);
});

test("storage falls back to session storage when persistent storage is unavailable", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.failWrites = true;
  assert.equal(storeCompanyData(company(), { local, session }), true);
  assert.equal(readCompanyData("AAPL", { local, session })?.company.symbol, "AAPL");
});

test("research storage validates the ticker and bounded risk records", () => {
  const local = new MemoryStorage();
  const research = { symbol: "AAPL", risks: [{ level: "medium" as const, title: "Demand", detail: "Demand may slow." }] };
  assert.equal(storeResearchData(research, { local }), true);
  assert.deepEqual(readResearchData("AAPL", { local }), research);
  assert.equal(readResearchData("MSFT", { local }), null);

  local.setItem(RESEARCH_STORAGE_KEY, JSON.stringify({ symbol: "AAPL", risks: [{ level: "unknown", title: "Bad", detail: "Bad" }] }));
  assert.equal(readResearchData("AAPL", { local }), null);
  assert.equal(local.getItem(RESEARCH_STORAGE_KEY), null);
});
