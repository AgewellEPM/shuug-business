/**
 * Fixed-window rate limiter — a fail-closed guard for unauthenticated/public
 * endpoints (webhooks) so a flood can't exhaust the server. In-memory per
 * instance (fine for single-node / demo; swap for Redis when horizontally
 * scaled). Pure core (`decide`) is unit-tested; `rateLimit` wires the clock/store.
 */
export interface RateDecision { allowed: boolean; remaining: number; resetAt: number }

interface Bucket { count: number; resetAt: number }

/** Pure decision given the current bucket + now. Returns the next bucket too. */
export function decide(bucket: Bucket | undefined, now: number, limit: number, windowMs: number): { decision: RateDecision; next: Bucket } {
  if (!bucket || now >= bucket.resetAt) {
    const next = { count: 1, resetAt: now + windowMs };
    return { decision: { allowed: true, remaining: limit - 1, resetAt: next.resetAt }, next };
  }
  const count = bucket.count + 1;
  return {
    decision: { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: bucket.resetAt },
    next: { count, resetAt: bucket.resetAt },
  };
}

const holder = globalThis as unknown as { __rateBuckets?: Map<string, Bucket> };
holder.__rateBuckets ??= new Map();

/** Consume one token for `key`. Default: 60 requests / 60s. */
export function rateLimit(key: string, limit = 60, windowMs = 60_000, now = Date.now()): RateDecision {
  const store = holder.__rateBuckets!;
  const { decision, next } = decide(store.get(key), now, limit, windowMs);
  store.set(key, next);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (store.size > 5000) for (const [k, b] of store) if (now >= b.resetAt) store.delete(k);
  return decision;
}

/** Best-effort client key from a request (proxy-aware). */
export function clientKey(req: Request, scope: string): string {
  const h = req.headers;
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
  return `${scope}:${ip}`;
}
