import { db, type Db } from "@/lib/db/client";
import { redact, safeErrorMessage } from "@/lib/log";

export type SyncTrigger = "cron" | "manual" | "stale" | "login";
export type SyncStatus = "success" | "partial" | "failed" | "skipped";

// ------------------------------------------------------------------ locks
/** Lease lock: expires on its own if the function crashes or times out. */
export async function acquireUserLock(userId: string, owner: string, leaseSeconds: number, sql: Db = db()): Promise<boolean> {
  const rows = await sql`
    update users set sync_lock_owner = ${owner}, sync_lock_until = now() + make_interval(secs => ${leaseSeconds})
    where id = ${userId} and (sync_lock_until is null or sync_lock_until < now())
    returning id`;
  return rows.length === 1;
}

export async function renewUserLock(userId: string, owner: string, leaseSeconds: number, sql: Db = db()): Promise<boolean> {
  const rows = await sql`
    update users set sync_lock_until = now() + make_interval(secs => ${leaseSeconds})
    where id = ${userId} and sync_lock_owner = ${owner} returning id`;
  return rows.length === 1;
}

export async function releaseUserLock(userId: string, owner: string, sql: Db = db()): Promise<void> {
  await sql`update users set sync_lock_owner = null, sync_lock_until = null where id = ${userId} and sync_lock_owner = ${owner}`;
}

/**
 * Atomically claims the next user whose sync is due. next_sync_at is pushed
 * forward immediately so concurrent cron invocations never pick the same
 * user; if this invocation dies, the user becomes due again 10 minutes later.
 */
export async function claimNextDueUser(sql: Db = db()): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    update users set next_sync_at = now() + interval '10 minutes'
    where id = (
      select u.id from users u
      join tmdb_accounts a on a.user_id = u.id and a.status = 'connected'
      where u.sync_enabled and u.next_sync_at <= now()
        and (u.sync_lock_until is null or u.sync_lock_until < now())
      order by u.next_sync_at
      limit 1
      for update of u skip locked)
    returning id`;
  return row?.id ?? null;
}

// ------------------------------------------------------------------ jobs & logs
export async function startJob(userId: string, trigger: SyncTrigger, sql: Db = db()): Promise<string> {
  const [row] = await sql<{ id: string }[]>`insert into sync_jobs (user_id, trigger) values (${userId}, ${trigger}) returning id`;
  await sql`update users set last_sync_started_at = now() where id = ${userId}`;
  return row!.id;
}

export interface JobStats {
  listsChecked: number;
  listsUpdated: number;
  itemsAdded: number;
  itemsRemoved: number;
  mediaResolved: number;
}

export async function finishJob(jobId: string, status: SyncStatus, stats: JobStats, error: string | null, sql: Db = db()): Promise<void> {
  await sql`
    update sync_jobs set status = ${status}, finished_at = now(),
      lists_checked = ${stats.listsChecked}, lists_updated = ${stats.listsUpdated},
      items_added = ${stats.itemsAdded}, items_removed = ${stats.itemsRemoved},
      media_resolved = ${stats.mediaResolved}, error = ${error}
    where id = ${jobId}`;
}

export async function addSyncLog(
  entry: { jobId: string | null; userId: string; listId?: string | null; level: "info" | "warn" | "error"; event: string; message?: string; details?: Record<string, unknown> },
  sql: Db = db(),
): Promise<void> {
  try {
    await sql`
      insert into sync_logs (job_id, user_id, list_id, level, event, message, details)
      values (${entry.jobId}, ${entry.userId}, ${entry.listId ?? null}, ${entry.level}, ${entry.event},
              ${entry.message ? safeErrorMessage(entry.message, 500) : null},
              ${entry.details ? sql.json(redact(entry.details) as never) : null})`;
  } catch {
    /* logging must never break a sync */
  }
}

/** Records the outcome on the user row and schedules the next run. */
export async function scheduleAfterSync(
  userId: string,
  status: SyncStatus,
  intervalMinutes: number,
  opts: { resumeNow?: boolean } = {},
  sql: Db = db(),
): Promise<void> {
  if (status === "partial" && !opts.resumeNow) {
    // Some lists failed (they carry their own backoff); the rest is up to date.
    await sql`
      update users set last_sync_status = 'partial', last_sync_finished_at = now(),
        next_sync_at = now() + make_interval(mins => ${intervalMinutes})
      where id = ${userId}`;
  } else if (status === "success") {
    await sql`
      update users set last_sync_status = 'success', last_sync_finished_at = now(), last_successful_sync_at = now(),
        consecutive_failures = 0,
        next_sync_at = now() + make_interval(mins => ${intervalMinutes}) + (random() * interval '60 seconds')
      where id = ${userId}`;
  } else if (status === "partial") {
    // Time budget exhausted: continue as soon as possible (next cron tick).
    await sql`update users set last_sync_status = 'partial', last_sync_finished_at = now(), next_sync_at = now() where id = ${userId}`;
  } else if (status === "skipped") {
    await sql`update users set last_sync_status = 'skipped', last_sync_finished_at = now(), next_sync_at = now() + interval '24 hours' where id = ${userId}`;
  } else {
    await sql`
      update users set last_sync_status = 'failed', last_sync_finished_at = now(),
        consecutive_failures = consecutive_failures + 1,
        next_sync_at = now() + least(interval '6 hours',
          make_interval(mins => ${intervalMinutes}) * power(2, least(consecutive_failures, 5)))
      where id = ${userId}`;
  }
}

// ------------------------------------------------------------------ maintenance
export async function cleanupExpired(sql: Db = db()): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  out.sessions = (await sql`delete from user_sessions where expires_at < now()`).count;
  out.authRequests = (await sql`delete from auth_requests where expires_at < now()`).count;
  out.rateLimits = (await sql`delete from rate_limits where window_start < now() - interval '1 day'`).count;
  out.syncLogs = (await sql`delete from sync_logs where created_at < now() - interval '30 days'`).count;
  out.syncJobs = (await sql`delete from sync_jobs where started_at < now() - interval '30 days'`).count;
  // Lists confirmed deleted on TMDB for more than 7 days.
  out.goneLists = (await sql`delete from tmdb_lists where status = 'gone' and gone_at < now() - interval '7 days'`).count;
  // Shared metadata no longer referenced by any list.
  out.orphanMedia = (await sql`
    delete from tmdb_media m where coalesce(m.fetched_at, now() - interval '31 days') < now() - interval '30 days'
      and not exists (select 1 from list_items li where li.media_type = m.media_type and li.tmdb_id = m.tmdb_id)`).count;
  // Jobs left "running" by a crashed invocation.
  out.staleJobs = (await sql`update sync_jobs set status = 'failed', finished_at = now(), error = 'interrupted'
                             where status = 'running' and started_at < now() - interval '1 hour'`).count;
  return out;
}
