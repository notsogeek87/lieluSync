import { randomUUID } from "node:crypto";
import { env } from "@/lib/config/env";
import { log, safeErrorMessage } from "@/lib/log";
import { tmdb } from "@/lib/tmdb";
import type { TmdbClient } from "@/lib/tmdb/client";
import { isTmdbError, TmdbError } from "@/lib/tmdb/errors";
import { fetchAllPages, type Page } from "@/lib/tmdb/pagination";
import type { TmdbListItem } from "@/lib/tmdb/schemas";
import { getAccessToken, getAccountByUser, markTokenRevoked } from "@/lib/repo/tmdb-accounts";
import {
  applyListSnapshot,
  markListFailed,
  markListUnchanged,
  markMissingListsGone,
  upsertRemoteLists,
  type ListRow,
  type RemoteListInfo,
} from "@/lib/repo/lists";
import {
  acquireUserLock,
  addSyncLog,
  finishJob,
  releaseUserLock,
  renewUserLock,
  scheduleAfterSync,
  startJob,
  type JobStats,
  type SyncStatus,
  type SyncTrigger,
} from "@/lib/repo/sync";
import { customListSignature, watchlistSignature } from "./signature";
import { toSnapshot } from "./items";
import { resolveMedia } from "./media";

const LOCK_LEASE_SECONDS = 180;
/** Even when signatures match, re-read every list completely at this interval. */
const FULL_REFRESH_MS = 6 * 3600_000;
/** Media lookups allowed per user sync (keeps one invocation within budget). */
const MEDIA_BUDGET_PER_USER = 400;

export interface SyncOptions {
  deadline?: number;
  client?: TmdbClient;
  /** Ignore change signatures and re-read every list. */
  force?: boolean;
}

export interface SyncResult extends JobStats {
  status: SyncStatus | "locked";
  error?: string;
}

class TokenRevokedError extends Error {}

const emptyStats = (): JobStats => ({ listsChecked: 0, listsUpdated: 0, itemsAdded: 0, itemsRemoved: 0, mediaResolved: 0 });

interface RemoteSnapshot {
  info: RemoteListInfo;
  firstPage?: Page<TmdbListItem>;
}

/** Reads the list index. Throws on any failure so nothing gets marked as deleted by mistake. */
async function discoverRemoteLists(client: TmdbClient, token: string, accountId: string): Promise<RemoteSnapshot[]> {
  const [custom, wlMovie, wlTv] = await Promise.all([
    client.getAllAccountLists(token, accountId),
    client.getWatchlistPage(token, accountId, "movie", 1),
    client.getWatchlistPage(token, accountId, "tv", 1),
  ]);
  const out: RemoteSnapshot[] = [
    { info: { kind: "watchlist_movie", tmdbListId: "movie", name: "Ma Watchlist", description: null, isPublic: false, itemCount: wlMovie.total_results, updatedAt: null }, firstPage: wlMovie },
    { info: { kind: "watchlist_tv", tmdbListId: "tv", name: "Ma Watchlist", description: null, isPublic: false, itemCount: wlTv.total_results, updatedAt: null }, firstPage: wlTv },
  ];
  const seen = new Set<string>();
  for (const l of custom.items) {
    const id = String(l.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      info: {
        kind: "custom",
        tmdbListId: id,
        name: l.name.trim() || `Liste ${id}`,
        description: l.description?.trim() || null,
        isPublic: typeof l.public === "boolean" ? l.public : l.public === 1,
        itemCount: l.number_of_items ?? null,
        updatedAt: l.updated_at ?? null,
      },
    });
  }
  return out;
}

async function syncOneList(
  client: TmdbClient,
  token: string,
  accountId: string,
  userId: string,
  list: ListRow,
  remote: RemoteSnapshot,
  force: boolean,
): Promise<{ changed: boolean; added: number; removed: number }> {
  const signature =
    list.kind === "custom" ? customListSignature(remote.info.itemCount, remote.info.updatedAt) : watchlistSignature(remote.firstPage!);
  const fresh = list.last_full_sync_at && Date.now() - list.last_full_sync_at.getTime() < FULL_REFRESH_MS;
  if (!force && list.status === "ok" && list.remote_signature === signature && fresh) {
    await markListUnchanged(list.id);
    return { changed: false, added: 0, removed: 0 };
  }

  let results: TmdbListItem[];
  if (list.kind === "custom") {
    const all = await fetchAllPages((p) => client.getListPage(token, list.tmdb_list_id, p));
    results = all.items;
  } else {
    const type = list.kind === "watchlist_movie" ? "movie" : "tv";
    const all = await fetchAllPages((p) => client.getWatchlistPage(token, accountId, type, p), { firstPage: remote.firstPage });
    results = all.items;
  }
  const defaultType = list.kind === "watchlist_movie" ? "movie" : list.kind === "watchlist_tv" ? "tv" : undefined;
  const snapshot = toSnapshot(results, defaultType);
  const res = await applyListSnapshot(userId, list, snapshot, signature);
  return { changed: true, added: res.added, removed: res.removed };
}

/**
 * Synchronises one user. Safe to call from cron, manual and on-demand paths:
 * a lease lock guarantees a single concurrent run per user, every list is
 * committed atomically, and any failure leaves previously synced data intact.
 */
export async function syncUser(userId: string, trigger: SyncTrigger, opts: SyncOptions = {}): Promise<SyncResult> {
  const deadline = opts.deadline ?? Date.now() + 50_000;
  const owner = randomUUID();
  if (!(await acquireUserLock(userId, owner, LOCK_LEASE_SECONDS))) {
    return { status: "locked", ...emptyStats() };
  }
  const client = opts.client ?? tmdb();
  const stats = emptyStats();
  let jobId: string | null = null;
  let status: SyncStatus = "success";
  let error: string | null = null;
  let outOfTime = false;

  try {
    jobId = await startJob(userId, trigger);
    const account = await getAccountByUser(userId);
    const token = account?.status === "connected" ? await getAccessToken(userId) : null;
    if (!account || !token) {
      status = "skipped";
      error = "TMDB account not connected";
      return { status, ...stats, error };
    }

    let remote: RemoteSnapshot[];
    try {
      remote = await discoverRemoteLists(client, token, account.account_object_id);
    } catch (err) {
      if (isTmdbError(err, "unauthorized")) throw new TokenRevokedError();
      throw err;
    }

    const rows = await upsertRemoteLists(userId, remote.map((r) => r.info));
    const gone = await markMissingListsGone(userId, remote.filter((r) => r.info.kind === "custom").map((r) => r.info.tmdbListId));
    for (const id of gone) await addSyncLog({ jobId, userId, listId: id, level: "info", event: "list_gone", message: "List no longer exists on TMDB" });

    const byKey = new Map(remote.map((r) => [`${r.info.kind}:${r.info.tmdbListId}`, r]));
    const ordered = rows.sort((a, b) => (a.last_checked_at?.getTime() ?? 0) - (b.last_checked_at?.getTime() ?? 0));

    for (const list of ordered) {
      if (Date.now() > deadline) {
        status = "partial";
        outOfTime = true;
        break;
      }
      if (trigger !== "manual" && list.next_attempt_at && list.next_attempt_at.getTime() > Date.now()) continue;
      const r = byKey.get(`${list.kind}:${list.tmdb_list_id}`);
      if (!r) continue;
      stats.listsChecked++;
      try {
        const res = await syncOneList(client, token, account.account_object_id, userId, list, r, opts.force ?? trigger === "manual");
        if (res.changed) {
          stats.listsUpdated++;
          stats.itemsAdded += res.added;
          stats.itemsRemoved += res.removed;
          if (res.added || res.removed) {
            await addSyncLog({ jobId, userId, listId: list.id, level: "info", event: "list_synced", details: { added: res.added, removed: res.removed } });
          }
        }
      } catch (err) {
        if (isTmdbError(err, "unauthorized")) throw new TokenRevokedError();
        const msg = safeErrorMessage(err);
        await markListFailed(list.id, msg);
        await addSyncLog({ jobId, userId, listId: list.id, level: "warn", event: "list_failed", message: msg });
        status = "partial";
      }
      await renewUserLock(userId, owner, LOCK_LEASE_SECONDS);
    }

    if (Date.now() < deadline) {
      stats.mediaResolved = await resolveMedia(client, { userId, limit: MEDIA_BUDGET_PER_USER, deadline });
    }
    return { status, ...stats };
  } catch (err) {
    if (err instanceof TokenRevokedError) {
      await markTokenRevoked(userId);
      status = "skipped";
      error = "TMDB access was revoked; reconnect required";
      await addSyncLog({ jobId, userId, level: "error", event: "token_revoked", message: error });
    } else {
      status = "failed";
      error = safeErrorMessage(err);
      log.error("sync.user_failed", { userId, trigger, err });
      if (jobId) await addSyncLog({ jobId, userId, level: "error", event: "sync_failed", message: error });
    }
    return { status, ...stats, error };
  } finally {
    try {
      if (jobId) await finishJob(jobId, status, stats, error);
      await scheduleAfterSync(userId, status, env().SYNC_INTERVAL_MINUTES, { resumeNow: outOfTime });
    } catch (err) {
      log.error("sync.bookkeeping_failed", { userId, err });
    }
    await releaseUserLock(userId, owner).catch(() => undefined);
  }
}

export { TmdbError };
