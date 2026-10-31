import { env } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { json } from "@/lib/http/api";
import { tmdb } from "@/lib/tmdb";
import { isTmdbError } from "@/lib/tmdb/errors";

async function tmdbStatus(): Promise<"ok" | "invalid_token" | "unavailable"> {
  try {
    return (await tmdb().checkAppToken()) ? "ok" : "invalid_token";
  } catch (err) {
    return isTmdbError(err, "unauthorized") ? "invalid_token" : "unavailable";
  }
}

export const dynamic = "force-dynamic";

/** Public liveness/readiness probe. Exposes no user data. */
export async function GET() {
  const started = Date.now();
  try {
    env();
  } catch (err) {
    // Names of missing/invalid variables only — never their values.
    const missing = String(err instanceof Error ? err.message : err)
      .replace(/^Invalid environment configuration: /, "")
      .split("; ")
      .map((x) => x.split(":")[0]);
    return json({ status: "misconfigured", invalidVariables: missing }, 503);
  }
  try {
    const [row] = await db()<{ last: Date | null; due: number }[]>`
      select max(last_sync_finished_at) as last,
             count(*) filter (where sync_enabled and next_sync_at < now() - interval '30 minutes')::int as due
      from users`;
    const tmdbApi = await tmdbStatus();
    return json({
      status: tmdbApi === "ok" ? "ok" : "degraded",
      database: "ok",
      tmdb: tmdbApi,
      lastSyncFinishedAt: row?.last ?? null,
      overdueUsers: row?.due ?? 0,
      latencyMs: Date.now() - started,
    });
  } catch {
    return json({ status: "degraded", database: "unavailable" }, 503);
  }
}
