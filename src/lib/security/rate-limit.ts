import { db, type Db } from "@/lib/db/client";
import { hashToken } from "@/lib/security/crypto";
import { log } from "@/lib/log";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter stored in Postgres (works across serverless instances
 * without an extra service). Keys are HMAC-hashed so IPs are never stored.
 * Fails open on database errors so a DB hiccup does not take the addon down;
 * Vercel Firewall rules can be layered on top (see docs/SECURITY.md).
 */
export async function rateLimit(rawKey: string, limit: number, windowSeconds: number, sql: Db = db()): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now) / 1000));
  try {
    const [row] = await sql<{ count: number }[]>`
      insert into rate_limits (key, window_start, count) values (${hashToken(rawKey, "ratelimit")}, ${windowStart}, 1)
      on conflict (key, window_start) do update set count = rate_limits.count + 1
      returning count`;
    const count = row?.count ?? 1;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds };
  } catch (err) {
    log.warn("rate_limit.unavailable", { err });
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

/** Best-effort client IP as provided by the Vercel edge network. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
