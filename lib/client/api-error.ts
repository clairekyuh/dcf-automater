type ApiErrorPayload = { error?: unknown; code?: unknown; requestId?: unknown };

export function apiErrorMessage(payload: unknown, fallback: string) {
  const candidate = payload && typeof payload === "object" ? payload as ApiErrorPayload : {};
  const message = typeof candidate.error === "string" && candidate.error.trim() ? candidate.error.trim() : fallback;
  const requestId = typeof candidate.requestId === "string" && /^[A-Za-z0-9._-]{8,128}$/.test(candidate.requestId) ? candidate.requestId : null;
  const code = typeof candidate.code === "string" && /^[A-Z0-9_]{3,64}$/.test(candidate.code) ? candidate.code : null;
  const diagnostic = [code, requestId].filter(Boolean).join(" · ");
  return diagnostic ? `${message} Reference: ${diagnostic}.` : message;
}
