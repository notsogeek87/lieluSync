import { requireUser, json, apiError } from "@/lib/http/api";
import { db } from "@/lib/db/client";
import { syncUser } from "@/lib/sync/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual synchronisation (at most once per minute per user). */
export async function POST(req: Request) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const [allowed] = await db()<{ id: string }[]>`
    update users set last_manual_sync_at = now()
    where id = ${auth.userId} and (last_manual_sync_at is null or last_manual_sync_at < now() - interval '60 seconds')
    returning id`;
  if (!allowed) return apiError(429, "too_soon", "Une synchronisation vient d'être lancée. Réessayez dans une minute.");
  const result = await syncUser(auth.userId, "manual", { deadline: Date.now() + 50_000 });
  if (result.status === "locked") return apiError(409, "sync_in_progress", "Une synchronisation est déjà en cours.");
  return json({ ok: result.status === "success" || result.status === "partial", result });
}
