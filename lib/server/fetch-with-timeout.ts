export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number };
};

export type FetchWithTimeoutOptions = {
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxRetryAfterMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_RETRY_AFTER_MS = 2_000;

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500 && status <= 599;
}

function retryAfterMilliseconds(value: string | null, now: () => number) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now()) : null;
}

function retryDelay(
  response: Response,
  retryIndex: number,
  baseDelayMs: number,
  maxRetryAfterMs: number,
  random: () => number,
  now: () => number,
) {
  const exponentialDelay = baseDelayMs * 2 ** retryIndex;
  const jitter = Math.floor(baseDelayMs * 0.2 * random());
  const requestedDelay = retryAfterMilliseconds(response.headers.get("retry-after"), now);
  const cappedRetryAfter = requestedDelay === null
    ? 0
    : Math.min(requestedDelay, maxRetryAfterMs);
  return Math.max(exponentialDelay + jitter, cappedRetryAfter);
}

function requestSignal(callerSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: NextFetchInit = {},
  options: FetchWithTimeoutOptions = {},
) {
  const {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxRetryAfterMs = DEFAULT_MAX_RETRY_AFTER_MS,
    random = Math.random,
    sleep = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
    now = Date.now,
  } = options;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("timeoutMs must be greater than zero.");
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new RangeError("maxRetries must be a non-negative integer.");

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetchImpl(input, {
      ...init,
      signal: requestSignal(init.signal, timeoutMs),
    });

    if (!isRetryableStatus(response.status) || attempt === maxRetries) return response;

    // A response that will not be consumed should release its connection before
    // the next attempt. Cancellation failure is non-fatal to the retry itself.
    await response.body?.cancel().catch(() => undefined);
    await sleep(retryDelay(
      response,
      attempt,
      baseDelayMs,
      maxRetryAfterMs,
      random,
      now,
    ));
  }

  throw new Error("Upstream request retry loop ended unexpectedly.");
}
