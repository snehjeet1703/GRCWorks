import { NextResponse } from "next/server";

// In-memory, per-process buckets: correct for a single app instance. Running several
// instances behind a load balancer needs a shared store (e.g. Redis) instead.
const buckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  const remaining = Math.max(0, limit - bucket.count);
  return { ok: bucket.count <= limit, remaining, resetAt: bucket.resetAt };
}

export function rateLimitHeaders(remaining: number, resetAt: number) {
  return {
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

// Leftmost X-Forwarded-For entry is the client as seen by the first proxy. Only trustworthy
// behind a proxy that overwrites the header (Render, Fly, Railway, nginx with real_ip).
export function clientIp(headers: Headers | Record<string, string | string[] | undefined>): string {
  const get = (name: string) => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  return (
    get("fly-client-ip") ??
    get("x-forwarded-for")?.split(",")[0]?.trim() ??
    get("x-real-ip") ??
    "unknown"
  );
}

// Returns a 429 response when the bucket is exhausted, otherwise null.
export function limitOrNull(key: string, limit: number, windowMs: number): NextResponse | null {
  const { ok, remaining, resetAt } = rateLimit(key, limit, windowMs);
  if (ok) return null;
  return NextResponse.json(
    { error: "Too many attempts. Please try again later." },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(remaining, resetAt),
        "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
      },
    }
  );
}
