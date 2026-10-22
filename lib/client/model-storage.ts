import type { DcfModel, ForecastDriver } from "@/lib/dcf-engine";
import type { StorageLike } from "@/lib/client/company-storage";

export type SavedModel = { model: DcfModel; manualExitMultiple: boolean; editedFields: string[]; editedForecastFields: Record<string, string[]> };
const key = (symbol: string) => `dcf:model:v1:${symbol}`;
const browserStore = () => { try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; } };
const within = (value: unknown, min: number, max: number) => typeof value !== "number" || Number.isFinite(value) && value >= min && value <= max;

export function readModel(symbol: string, storage: StorageLike | undefined = browserStore()): SavedModel | null {
  try {
    const raw = storage?.getItem(key(symbol));
    if (!raw || raw.length > 60_000) return null;
    const value = JSON.parse(raw) as SavedModel;
    if (!value?.model || typeof value.manualExitMultiple !== "boolean" || !Array.isArray(value.editedFields) || !value.editedFields.every((field) => typeof field === "string") || !value.editedForecastFields || typeof value.editedForecastFields !== "object") return null;
    const model = value.model;
    if (!value.editedFields.every((field) => Object.hasOwn(model, field) && (field === "valuationDate" ? typeof model.valuationDate === "string" : typeof model[field as keyof DcfModel] === "number" && Number.isFinite(model[field as keyof DcfModel])))) return null;
    if (!Array.isArray(model.forecastDrivers) || model.forecastDrivers.length !== 6 || typeof model.valuationDate !== "string") return null;
    if (!Object.entries(model).every(([field, number]) => field === "forecastDrivers" || field === "valuationDate" || field === "sourceInputOverrides" || typeof number === "number" && Number.isFinite(number))) return null;
    if (!model.forecastDrivers.every((driver) => typeof driver.periodEnd === "string" && typeof driver.source === "string" && Object.entries(driver).every(([field, number]) => field === "periodEnd" || field === "source" || typeof number === "number" && Number.isFinite(number)))) return null;
    if (!within(model.riskFreeRate, -5, 25) || !within(model.beta, -5, 10) || !within(model.equityRiskPremium, -5, 25) || !within(model.preTaxCostDebt, 0, 50) || !within(model.companyRiskPremium, -20, 50)) return null;
    if (!within(model.normalizedTaxRate, 0, 100) || !within(model.terminalGrowth, -10, 10) || !within(model.terminalRoic, 0, 100)) return null;
    if (!Object.values(value.editedForecastFields).every((fields) => Array.isArray(fields) && fields.every((field) => typeof field === "string"))) return null;
    return value;
  } catch { return null; }
}

export function saveModel(symbol: string, value: SavedModel, storage: StorageLike | undefined = browserStore()) {
  try { storage?.setItem(key(symbol), JSON.stringify(value)); } catch { /* Keep current in-memory edits when storage is unavailable. */ }
}

/** Refresh untouched defaults; retain only fields the analyst actually edited. */
export function restoreModel(fresh: DcfModel, saved: SavedModel | null): DcfModel {
  if (!saved) return fresh;
  const overrides = Object.fromEntries(saved.editedFields.filter((field) => field !== "forecastDrivers" && Object.hasOwn(fresh, field)).map((field) => [field, saved.model[field as keyof DcfModel]]));
  return { ...fresh, ...overrides, forecastDrivers: fresh.forecastDrivers.map((driver, index) => {
    // Do not apply a saved fiscal year's assumptions to a different year after a roll forward.
    const old = saved.model.forecastDrivers.find((period) => period.periodEnd === driver.periodEnd);
    const oldIndex = old ? saved.model.forecastDrivers.indexOf(old) : index;
    if (!old) return driver;
    const fields = saved.editedForecastFields[String(oldIndex)] || [];
    return { ...driver, ...Object.fromEntries(fields.filter((field) => field !== "periodEnd" && field !== "source" && Object.hasOwn(driver, field)).map((field) => [field, old[field as keyof ForecastDriver]])) };
  }) };
}

export function restoredForecastEdits(fresh: DcfModel, saved: SavedModel | null): Record<string, string[]> {
  if (!saved) return {};
  return Object.fromEntries(fresh.forecastDrivers.flatMap((driver, index) => {
    const oldIndex = saved.model.forecastDrivers.findIndex((old) => old.periodEnd === driver.periodEnd);
    const fields = saved.editedForecastFields[String(oldIndex)];
    return fields?.length ? [[String(index), fields]] : [];
  }));
}
