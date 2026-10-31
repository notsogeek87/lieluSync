import { env } from "@/lib/config/env";
import { safeEqual } from "@/lib/security/crypto";
import { runCronTick } from "@/lib/sync/cron";
import { apiError, json } from "@/lib/http/api";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const header = (req.headers.get("authorization") ?? "").trim();
  // "Bearer <secret>" (Vercel Cron) or the bare secret (some external schedulers).
  const value = header.replace(/^Bearer\s+/i, "");
  return value.length > 0 && safeEqual(value, env().CRON_SECRET);
}

/**
 * Scheduler entry point. Called by Vercel Cron (GET, with
 * "Authorization: Bearer $CRON_SECRET" added automatically) or by any external
 * scheduler sending the same header (GET or POST).
 */
async function handle(req: Request) {
  if (!authorized(req)) {
    // Diagnostic without any secret material: shape of the header only.
    const header = (req.headers.get("authorization") ?? "").trim();
    const value = header.replace(/^Bearer\s+/i, "");
    log.warn("cron.unauthorized", {
      headerPresent: header.length > 0,
      bearerPrefix: /^Bearer\s+/i.test(header),
      receivedLength: value.length,
      expectedLength: env().CRON_SECRET.length,
    });
    return apiError(401, "unauthorized");
  }
  const summary = await runCronTick({ budgetMs: env().CRON_TIME_BUDGET_SECONDS * 1000 });
  return json({ ok: true, ...summary });
}

export const GET = handle;
export const POST = handle;
