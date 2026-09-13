import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export type RequestDiagnostics = {
  requestId: string;
  route: string;
  startedAt: number;
};

type DiagnosticLevel = "info" | "warn" | "error";
type DiagnosticFields = {
  event: string;
  status: number;
  symbol?: string | null;
  provider?: "nasdaq" | "sec" | "fred" | "damodaran" | "stock-analysis" | "internal";
  operationDurationMs?: number;
  attempt?: number;
  secStatus?: "available" | "unavailable";
  peerCount?: number;
  expectedPeerCount?: number;
  outcome?: "success" | "degraded" | "rejected" | "error";
  errorType?: string;
};

export function createRequestDiagnostics(request: Pick<Request, "headers">, route: string): RequestDiagnostics {
  const suppliedRequestId = request.headers.get("x-request-id")?.trim() || "";
  return {
    requestId: REQUEST_ID_PATTERN.test(suppliedRequestId) ? suppliedRequestId : randomUUID(),
    route,
    startedAt: Date.now(),
  };
}

export function safeErrorType(error: unknown) {
  const type = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(type) ? type : "UnknownError";
}

export function logDiagnostic(level: DiagnosticLevel, diagnostics: RequestDiagnostics, fields: DiagnosticFields) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    requestId: diagnostics.requestId,
    route: diagnostics.route,
    durationMs: Math.max(0, Date.now() - diagnostics.startedAt),
    ...fields,
  };
  console[level](JSON.stringify(entry));
}

export function withDiagnosticHeaders<T extends Response>(response: T, diagnostics: RequestDiagnostics): T {
  response.headers.set("X-Request-ID", diagnostics.requestId);
  response.headers.set("Server-Timing", `app;dur=${Math.max(0, Date.now() - diagnostics.startedAt)}`);
  return response;
}

export async function measureDiagnostic<T>(
  diagnostics: RequestDiagnostics,
  fields: Omit<DiagnosticFields, "status" | "outcome" | "operationDurationMs" | "errorType">,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    logDiagnostic("info", diagnostics, { ...fields, status: 200, outcome: "success", operationDurationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    logDiagnostic("warn", diagnostics, { ...fields, status: 502, outcome: "degraded", operationDurationMs: Date.now() - startedAt, errorType: safeErrorType(error) });
    throw error;
  }
}
