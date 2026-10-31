import { log } from "@/lib/log";
import { tmdb } from "@/lib/tmdb";
import type { TmdbClient } from "@/lib/tmdb/client";
import { claimNextDueUser, cleanupExpired } from "@/lib/repo/sync";
import { resolveMedia } from "./media";
import { syncUser } from "./engine";

export interface CronSummary {
  usersProcessed: number;
  results: Record<string, number>;
  mediaRefreshed: number;
  cleanup: Record<string, number> | null;
  durationMs: number;
}

/**
 * One scheduler tick. Stateless and idempotent: it processes whatever is due
 * (including users missed by a failed or delayed previous tick) until the
 * time budget is spent, then stops cleanly. Remaining work is picked up by
 * the next tick or by on-demand syncs.
 */
export async function runCronTick(opts: { budgetMs: number; concurrency?: number; client?: TmdbClient }): Promise<CronSummary> {
  const started = Date.now();
  const deadline = started + opts.budgetMs;
  const perUserBudget = Math.min(120_000, opts.budgetMs);
  const client = opts.client ?? tmdb();
  const results: Record<string, number> = {};
  let usersProcessed = 0;

  const worker = async () => {
    while (Date.now() < deadline - 15_000) {
      const userId = await claimNextDueUser();
      if (!userId) return;
      const res = await syncUser(userId, "cron", { client, deadline: Math.min(deadline, Date.now() + perUserBudget) });
      usersProcessed++;
      results[res.status] = (results[res.status] ?? 0) + 1;
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 3 }, worker));

  let mediaRefreshed = 0;
  if (Date.now() < deadline - 10_000) {
    // Refresh shared metadata that went stale (French titles, posters, IMDb ids).
    mediaRefreshed = await resolveMedia(client, { userId: null, limit: 300, deadline: deadline - 5_000 }).catch((err) => {
      log.warn("cron.media_refresh_failed", { err });
      return 0;
    });
  }

  let cleanup: Record<string, number> | null = null;
  try {
    cleanup = await cleanupExpired();
  } catch (err) {
    log.warn("cron.cleanup_failed", { err });
  }

  const summary = { usersProcessed, results, mediaRefreshed, cleanup, durationMs: Date.now() - started };
  log.info("cron.tick", summary as unknown as Record<string, unknown>);
  return summary;
}
