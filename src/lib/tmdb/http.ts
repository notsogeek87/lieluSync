import type { z } from "zod";
import { TmdbError } from "./errors";
import { RequestLimiter } from "./limiter";

export const TMDB_API_BASE = "https://api.themoviedb.org";

export interface TmdbHttpOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  limiter?: RequestLimiter;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface TmdbRequest<S extends z.ZodTypeAny> {
  method?: "GET" | "POST" | "DELETE";
  path: string;
  bearer: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  schema: S;
}

const sharedLimiter = new RequestLimiter(8, 30); // <= ~33 req/s per instance

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffMs(attempt: number): number {
  const base = Math.min(8000, 500 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(15000, Math.max(0, secs * 1000));
  const date = Date.parse(h);
  return Number.isNaN(date) ? undefined : Math.min(15000, Math.max(0, date - Date.now()));
}

function classify(status: number): TmdbError["code"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "bad_request";
}

/**
 * Low-level TMDB HTTP client: bearer auth, JSON validation, timeouts, and
 * retries with exponential backoff for 429 / 5xx / network failures.
 * Tokens are never included in thrown errors.
 */
export class TmdbHttp {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly limiter: RequestLimiter;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: TmdbHttpOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((...args) => globalThis.fetch(...args));
    this.baseUrl = opts.baseUrl ?? TMDB_API_BASE;
    this.limiter = opts.limiter ?? sharedLimiter;
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 10000;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async request<S extends z.ZodTypeAny>(req: TmdbRequest<S>): Promise<z.infer<S>> {
    const url = new URL(req.path, this.baseUrl);
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const method = req.method ?? "GET";
    const label = `${method} ${url.pathname}`;

    let lastError: TmdbError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let res: Response;
      try {
        res = await this.limiter.run(() =>
          this.fetchImpl(url, {
            method,
            headers: {
              Authorization: `Bearer ${req.bearer}`,
              Accept: "application/json",
              ...(req.body !== undefined ? { "Content-Type": "application/json;charset=utf-8" } : {}),
            },
            body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
            signal: AbortSignal.timeout(this.timeoutMs),
            cache: "no-store",
          }),
        );
      } catch (err) {
        const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        lastError = new TmdbError(isTimeout ? "timeout" : "network", `${label} failed: ${isTimeout ? "timeout" : "network error"}`);
        if (attempt < this.maxRetries) {
          await this.sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      if (res.ok) {
        let json: unknown;
        try {
          json = await res.json();
        } catch {
          throw new TmdbError("invalid_response", `${label}: response is not JSON`, res.status);
        }
        const parsed = req.schema.safeParse(json);
        if (!parsed.success) {
          throw new TmdbError("invalid_response", `${label}: unexpected response shape (${parsed.error.issues[0]?.path.join(".") ?? "?"})`, res.status);
        }
        return parsed.data;
      }

      let tmdbStatusCode: number | undefined;
      try {
        const body = (await res.json()) as { status_code?: number };
        tmdbStatusCode = typeof body?.status_code === "number" ? body.status_code : undefined;
      } catch {
        /* ignore */
      }
      const code = classify(res.status);
      lastError = new TmdbError(code, `${label}: HTTP ${res.status}`, res.status, tmdbStatusCode);
      if (lastError.retryable && attempt < this.maxRetries) {
        await this.sleep(code === "rate_limited" ? (retryAfterMs(res) ?? backoffMs(attempt + 1)) : backoffMs(attempt));
        continue;
      }
      throw lastError;
    }
    throw lastError ?? new TmdbError("network", `${label} failed`);
  }
}
