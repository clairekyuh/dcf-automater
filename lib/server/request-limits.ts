type Bucket = { count: number; resetAt: number };

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function createFixedWindowRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }) {
  const buckets = new Map<string, Bucket>();
  const maxKeys = options.maxKeys ?? 2_000;

  return (key: string, now = Date.now()): RateLimitResult => {
    const existing = buckets.get(key);
    const bucket = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : existing;
    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > maxKeys) {
      for (const [storedKey, stored] of buckets) {
        if (stored.resetAt <= now || buckets.size > maxKeys) buckets.delete(storedKey);
        if (buckets.size <= maxKeys) break;
      }
    }
    return {
      allowed: bucket.count <= options.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  };
}

export function createConcurrencyGate(limit: number) {
  let active = 0;
  return {
    tryEnter() {
      if (active >= limit) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
      };
    },
    activeCount() {
      return active;
    },
  };
}

export function requestClientKey(request: Pick<Request, "headers">) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "anonymous";
  return forwarded.split(",", 1)[0].trim().slice(0, 80) || "anonymous";
}
