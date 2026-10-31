/** JSON responses for Stremio clients: CORS for all origins as required by the protocol. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export interface CachePolicy {
  maxAge: number;
  staleRevalidate?: number;
  staleError?: number;
}

export function stremioJson(body: unknown, init: { status?: number; cache?: CachePolicy } = {}): Response {
  const c = init.cache;
  const cacheControl = c
    ? `public, max-age=${c.maxAge}${c.staleRevalidate ? `, stale-while-revalidate=${c.staleRevalidate}` : ""}${c.staleError ? `, stale-if-error=${c.staleError}` : ""}`
    : "no-store";
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function stremioOptions(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" } });
}

/** Parses Stremio "extra" path segments such as "skip=100&genre=Drama". */
export function parseExtra(segment: string | undefined): Record<string, string> {
  if (!segment) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(segment)) out[k] = v;
  return out;
}
