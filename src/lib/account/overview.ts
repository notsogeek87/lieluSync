import { env } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { getAccountByUser } from "@/lib/repo/tmdb-accounts";
import { getDashboardStats, getListsForUser } from "@/lib/repo/lists";
import { decryptConfigToken, getUserById } from "@/lib/repo/users";

export function installUrls(token: string) {
  const base = `${env().APP_URL}/u/${token}`;
  const manifestUrl = `${base}/manifest.json`;
  const host = manifestUrl.replace(/^https?:\/\//, "");
  return {
    manifestUrl,
    stremioUrl: `stremio://${host}`,
    webInstallUrl: `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`,
  };
}

export type ServiceHealth = "ok" | "degraded" | "attention" | "disconnected";

export async function getOverview(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;
  const [account, stats, lists, lastJobs] = await Promise.all([
    getAccountByUser(userId),
    getDashboardStats(userId),
    getListsForUser(userId),
    db()<{ status: string; trigger: string; started_at: Date; finished_at: Date | null; items_added: number; items_removed: number; error: string | null }[]>`
      select status, trigger, started_at, finished_at, items_added, items_removed, error
      from sync_jobs where user_id = ${userId} order by started_at desc limit 5`,
  ]);
  let health: ServiceHealth = "ok";
  if (!account || account.status !== "connected") health = "disconnected";
  else if (user.last_sync_status === "failed" || user.consecutive_failures >= 3) health = "attention";
  else if (stats.listsInError > 0 || user.last_sync_status === "partial") health = "degraded";

  return {
    user: {
      id: user.id,
      createdAt: user.created_at,
      lastSyncStatus: user.last_sync_status,
      lastSyncFinishedAt: user.last_sync_finished_at,
      lastSuccessfulSyncAt: user.last_successful_sync_at,
      nextSyncAt: user.next_sync_at,
      syncing: !!(user.sync_lock_until && user.sync_lock_until.getTime() > Date.now()),
      configRotatedAt: user.config_token_rotated_at,
    },
    tmdb: account
      ? {
          status: account.status,
          username: account.username,
          displayName: account.display_name,
          avatarUrl: account.avatar_path ? `https://image.tmdb.org/t/p/w92${account.avatar_path}` : null,
          connectedAt: account.connected_at,
        }
      : null,
    stats,
    health,
    lists,
    lastJobs,
    install: installUrls(decryptConfigToken(user)),
    syncIntervalMinutes: env().SYNC_INTERVAL_MINUTES,
  };
}

export type Overview = NonNullable<Awaited<ReturnType<typeof getOverview>>>;
