import { db } from "@/lib/db/client";
import { json } from "@/lib/http/api";

export const dynamic = "force-dynamic";

/** Public liveness/readiness probe. Exposes no user data. */
export async function GET() {
  const started = Date.now();
  try {
    const [row] = await db()<{ last: Date | null; due: number }[]>`
      select max(last_sync_finished_at) as last,
             count(*) filter (where sync_enabled and next_sync_at < now() - interval '30 minutes')::int as due
      from users`;
    return json({
      status: "ok",
      database: "ok",
      lastSyncFinishedAt: row?.last ?? null,
      overdueUsers: row?.due ?? 0,
      latencyMs: Date.now() - started,
    });
  } catch {
    return json({ status: "degraded", database: "unavailable" }, 503);
  }
}
