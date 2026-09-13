export const MAX_TICKER_LENGTH = 12;

const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

export function normalizeTicker(value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  return TICKER_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeCompanyName(value: string | null | undefined, fallback: string, maxLength = 120) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, maxLength);
}
