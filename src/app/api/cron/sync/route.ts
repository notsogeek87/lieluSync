import { env } from "@/lib/config/env";
import { safeEqual } from "@/lib/security/crypto";
import { runCronTick } from "@/lib/sync/cron";
import { apiError, json } from "@/lib/http/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const header = (req.headers.get("authorization") ?? "").trim();
  const expected = `Bearer ${env().CRON_SECRET}`;
  return safeEqual(header, expected);
}

/**
 * Scheduler entry point. Called by Vercel Cron (GET, with
 * "Authorization: Bearer $CRON_SECRET" added automatically) or by any external
 * scheduler sending the same header (GET or POST).
 */
async function handle(req: Request) {
  if (!authorized(req)) return apiError(401, "unauthorized");
  const summary = await runCronTick({ budgetMs: env().CRON_TIME_BUDGET_SECONDS * 1000 });
  return json({ ok: true, ...summary });
}

export const GET = handle;
export const POST = handle;
