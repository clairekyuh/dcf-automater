const MAX_REQUEST_BYTES = 1_000_000;
const MAX_STRING_LENGTH = 1_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function walkJson(value: unknown, depth = 0): string | null {
  if (depth > 12) return "The export payload is nested too deeply.";
  if (typeof value === "number" && !Number.isFinite(value)) return "The export payload contains a non-finite number.";
  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) return "The export payload contains an oversized text field.";
  if (Array.isArray(value)) {
    if (value.length > 100) return "The export payload contains too many rows.";
    for (const item of value) {
      const issue = walkJson(item, depth + 1);
      if (issue) return issue;
    }
  } else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return "The export payload contains a forbidden property.";
      const issue = walkJson(item, depth + 1);
      if (issue) return issue;
    }
  }
  return null;
}

function hasFiniteFields(value: JsonObject, fields: string[]) {
  return fields.every((field) => finiteNumber(value[field]));
}

export function validateExportRequestHeaders(request: Request): string | null {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return "Content-Type must be application/json.";
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return "The export request is too large.";
  return null;
}

export function validateExportPayload(payload: unknown): string | null {
  const structuralIssue = walkJson(payload);
  if (structuralIssue) return structuralIssue;
  if (!isObject(payload) || !isObject(payload.company) || !isObject(payload.model) || !isObject(payload.metrics)) {
    return "A loaded company and complete model are required.";
  }
  const symbol = payload.company.symbol;
  if (typeof symbol !== "string" || !/^[A-Z0-9.-]{1,12}$/.test(symbol)) return "The company ticker is invalid.";
  if (typeof payload.company.name !== "string" || !payload.company.name.trim() || payload.company.name.length > 160) return "The company name is invalid.";
  if (!finiteNumber(payload.metrics.revenue)) return "The company revenue input is invalid.";

  const model = payload.model;
  const requiredModelNumbers = [
    "marketPrice", "shares", "cash", "shortDebt", "longDebt", "preferredInterest", "beta",
    "riskFreeRate", "equityRiskPremium", "preTaxCostDebt", "normalizedTaxRate", "companyRiskPremium",
    "terminalGrowth", "terminalRoic", "exitMultiple",
  ];
  if (!hasFiniteFields(model, requiredModelNumbers)) return "The model contains a missing or invalid numeric assumption.";
  if (typeof model.valuationDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(model.valuationDate)) return "The valuation date is invalid.";
  if (!Array.isArray(model.forecastDrivers) || model.forecastDrivers.length !== 6) return "The Excel model requires exactly six forecast periods.";
  for (const driver of model.forecastDrivers) {
    if (!isObject(driver) || typeof driver.periodEnd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(driver.periodEnd)) return "A forecast period is invalid.";
    if (typeof driver.source !== "string" || !driver.source.trim() || driver.source.length > 300) return "A forecast source label is invalid.";
    if (!hasFiniteFields(driver, ["revenueGrowth", "grossMargin", "ebitMargin", "taxRate", "daPercent", "capexPercent", "changeNwcPercent", "deferredTaxPercent", "otherNonCashPercent"])) return "A forecast driver contains an invalid number.";
  }
  if (!Array.isArray(payload.historical) || payload.historical.length > 20) return "Historical data must contain no more than 20 periods.";
  if (payload.comparison !== undefined) {
    if (!isObject(payload.comparison)) return "Comparable-company data is invalid.";
    if (payload.comparison.peers !== undefined && (!Array.isArray(payload.comparison.peers) || payload.comparison.peers.length > 20)) return "Comparable-company data must contain no more than 20 peers.";
  }
  return null;
}

export const exportRequestLimits = { maxBytes: MAX_REQUEST_BYTES } as const;
