import type { CompanyData, RiskItem } from "@/lib/company-data";

export const COMPANY_STORAGE_KEY = "dcf:last-company";
export const RESEARCH_STORAGE_KEY = "dcf:last-research";
export const COMPANY_STORAGE_VERSION = 1;
export const MAX_COMPANY_STORAGE_CHARS = 750_000;
export const MAX_RESEARCH_STORAGE_CHARS = 100_000;

type StorageKind = "company" | "research";
type StorageEnvelope<T> = {
  version: typeof COMPANY_STORAGE_VERSION;
  kind: StorageKind;
  savedAt: number;
  payload: T;
};

export type StoredResearch = { symbol: string; risks: RiskItem[] };

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type CompanyStorageTargets = {
  local?: StorageLike | null;
  session?: StorageLike | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown, max = 10_000): value is string =>
  typeof value === "string" && value.length <= max;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isNullableNumber = (value: unknown) => value === null || isFiniteNumber(value);
const isRiskLevel = (value: unknown): value is RiskItem["level"] =>
  value === "high" || value === "medium" || value === "low";

function isRiskItem(value: unknown): value is RiskItem {
  return isRecord(value)
    && isRiskLevel(value.level)
    && isString(value.title, 300)
    && isString(value.detail, 5_000);
}

function isPricePoint(value: unknown) {
  return isRecord(value) && isString(value.date, 32) && isFiniteNumber(value.close);
}

function isHistoricalRow(value: unknown) {
  if (!isRecord(value)) return false;
  return isString(value.year, 32)
    && ["revenue", "ebit", "ebitMargin", "operatingCashFlow", "capex", "capexPercentRevenue", "depreciation", "freeCashFlow"]
      .every((key) => isFiniteNumber(value[key]));
}

function isComparable(value: unknown) {
  if (!isRecord(value)) return false;
  return ["symbol", "name", "description", "sector", "industry"].every((key) => isString(value[key], 10_000))
    && ["marketCap", "revenueGrowth", "operatingMargin", "evToRevenue", "evToEbitda", "pe"].every((key) => isNullableNumber(value[key]));
}

function isBusinessAnalysis(value: unknown) {
  if (!isRecord(value)) return false;
  const financials = value.financials;
  const concentration = value.customerConcentration;
  const supplyChain = value.supplyChain;
  const defaultRisk = value.defaultRisk;
  if (!isRecord(financials) || !isRecord(concentration) || !isRecord(supplyChain) || !isRecord(defaultRisk)) return false;
  if (!["revenue", "cogs", "cogsPercentRevenue", "grossProfit", "grossMargin", "operatingCashFlow", "freeCashFlow", "currentAssets", "currentLiabilities", "interestExpense", "ebitda", "netDebt"]
    .every((key) => isNullableNumber(financials[key]))) return false;
  if (!Array.isArray(concentration.disclosures) || concentration.disclosures.length > 20) return false;
  if (!concentration.disclosures.every((item) => isRecord(item)
    && isString(item.customer, 500)
    && isFiniteNumber(item.revenuePercent)
    && isString(item.disclosure, 5_000))) return false;
  if (!Array.isArray(supplyChain.stages) || supplyChain.stages.length > 20
    || !supplyChain.stages.every((item) => isRecord(item) && isString(item.name, 500) && isString(item.detail, 5_000))) return false;
  if (!Array.isArray(supplyChain.signals) || supplyChain.signals.length > 30 || !supplyChain.signals.every(isRiskItem)) return false;
  if (!Array.isArray(defaultRisk.drivers) || defaultRisk.drivers.length > 30 || !defaultRisk.drivers.every((item) => isString(item, 5_000))) return false;
  const ratios = defaultRisk.ratios;
  if (!isRecord(ratios)
    || !["debtToRevenue", "netDebtToEbitda", "currentRatio", "interestCoverage", "fcfToDebt"].every((key) => isNullableNumber(ratios[key]))) return false;
  return isString(value.source, 2_000)
    && isString(value.companyDescription, 20_000)
    && isFiniteNumber(defaultRisk.points)
    && isString(defaultRisk.methodology, 10_000);
}

export function isCompanyData(value: unknown): value is CompanyData {
  if (!isRecord(value) || !isRecord(value.company) || !isRecord(value.market) || !isRecord(value.metrics)) return false;
  const company = value.company;
  const market = value.market;
  const metrics = value.metrics;
  if (!isString(value.source, 2_000) || !isString(value.asOf, 64)) return false;
  if (!["symbol", "name", "description", "exchange", "currency", "country", "sector", "industry"]
    .every((key) => isString(company[key], key === "description" ? 20_000 : 2_000))) return false;
  if (typeof company.symbol !== "string" || !/^[A-Z0-9.-]{1,12}$/.test(company.symbol)) return false;
  if (!["marketCap", "shares", "estimatedPrice", "beta"].every((key) => isFiniteNumber(market[key]))) return false;
  if (!["revenueGrowth", "revenue", "ebitMargin", "capexPercentRevenue", "daPercentRevenue", "cash", "debt", "taxRate"]
    .every((key) => isFiniteNumber(metrics[key]))) return false;
  if (!Array.isArray(value.historical) || value.historical.length > 100 || !value.historical.every(isHistoricalRow)) return false;
  if (market.priceHistory !== undefined
    && (!Array.isArray(market.priceHistory) || market.priceHistory.length > 6_000 || !market.priceHistory.every(isPricePoint))) return false;
  if (value.comparison !== undefined) {
    if (!isRecord(value.comparison) || !isComparable(value.comparison.company)
      || !Array.isArray(value.comparison.peers) || value.comparison.peers.length > 20 || !value.comparison.peers.every(isComparable)
      || !Array.isArray(value.comparison.selectedPeerSymbols) || value.comparison.selectedPeerSymbols.length > 20
      || !value.comparison.selectedPeerSymbols.every((symbol) => isString(symbol, 12))) return false;
  }
  return value.businessAnalysis === undefined || isBusinessAnalysis(value.businessAnalysis);
}

export function isStoredResearch(value: unknown): value is StoredResearch {
  return isRecord(value)
    && isString(value.symbol, 12)
    && /^[A-Z0-9.-]{1,12}$/.test(value.symbol)
    && Array.isArray(value.risks)
    && value.risks.length <= 50
    && value.risks.every(isRiskItem);
}

function decode<T>(raw: string, kind: StorageKind, maxChars: number, guard: (value: unknown) => value is T) {
  if (raw.length > maxChars) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && "version" in parsed) {
      if (parsed.version !== COMPANY_STORAGE_VERSION || parsed.kind !== kind || !isFiniteNumber(parsed.savedAt) || !guard(parsed.payload)) return null;
      return { payload: parsed.payload, savedAt: parsed.savedAt, legacy: false };
    }
    return guard(parsed) ? { payload: parsed, savedAt: 0, legacy: true } : null;
  } catch {
    return null;
  }
}

function safeGet(storage: StorageLike | null | undefined, key: string) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function safeRemove(storage: StorageLike | null | undefined, key: string) {
  try { storage?.removeItem(key); } catch { /* Storage can be unavailable in privacy modes. */ }
}

function writePreferred<T>(key: string, kind: StorageKind, payload: T, maxChars: number, targets: CompanyStorageTargets) {
  const serialized = JSON.stringify({ version: COMPANY_STORAGE_VERSION, kind, savedAt: Date.now(), payload } satisfies StorageEnvelope<T>);
  if (serialized.length > maxChars) return false;
  try {
    if (targets.local) {
      targets.local.setItem(key, serialized);
      safeRemove(targets.session, key);
      return true;
    }
  } catch { /* Fall back to session-only storage. */ }
  try {
    if (!targets.session) return false;
    targets.session.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

function browserTargets(): CompanyStorageTargets {
  if (typeof window === "undefined") return {};
  return { local: window.localStorage, session: window.sessionStorage };
}

export function storeCompanyData(company: CompanyData, targets = browserTargets()) {
  return isCompanyData(company)
    && writePreferred(COMPANY_STORAGE_KEY, "company", company, MAX_COMPANY_STORAGE_CHARS, targets);
}

export function readCompanyData(requestedSymbol?: string, targets = browserTargets()) {
  const candidates = ([targets.local, targets.session] as const).flatMap((storage) => {
    const raw = safeGet(storage, COMPANY_STORAGE_KEY);
    if (!raw) return [];
    const decoded = decode(raw, "company", MAX_COMPANY_STORAGE_CHARS, isCompanyData);
    if (!decoded) {
      safeRemove(storage, COMPANY_STORAGE_KEY);
      return [];
    }
    return [decoded];
  }).sort((a, b) => b.savedAt - a.savedAt);
  const selected = candidates.find(({ payload }) => !requestedSymbol || payload.company.symbol === requestedSymbol.toUpperCase());
  if (!selected) return null;
  if (selected.legacy) storeCompanyData(selected.payload, targets);
  return selected.payload;
}

export function storeResearchData(research: StoredResearch, targets = browserTargets()) {
  return isStoredResearch(research)
    && writePreferred(RESEARCH_STORAGE_KEY, "research", research, MAX_RESEARCH_STORAGE_CHARS, targets);
}

export function readResearchData(symbol: string, targets = browserTargets()) {
  const candidates = ([targets.local, targets.session] as const).flatMap((storage) => {
    const raw = safeGet(storage, RESEARCH_STORAGE_KEY);
    if (!raw) return [];
    const decoded = decode(raw, "research", MAX_RESEARCH_STORAGE_CHARS, isStoredResearch);
    if (!decoded) {
      safeRemove(storage, RESEARCH_STORAGE_KEY);
      return [];
    }
    return [decoded];
  }).sort((a, b) => b.savedAt - a.savedAt);
  const selected = candidates.find(({ payload }) => payload.symbol === symbol.toUpperCase());
  if (!selected) return null;
  if (selected.legacy) storeResearchData(selected.payload, targets);
  return selected.payload;
}
