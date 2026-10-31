import { db, type Db } from "@/lib/db/client";
import type { MediaType } from "@/lib/tmdb/schemas";

export type ListKind = "watchlist_movie" | "watchlist_tv" | "custom";

export interface ListRow {
  id: string;
  user_id: string;
  kind: ListKind;
  tmdb_list_id: string;
  name: string;
  description: string | null;
  is_public: boolean | null;
  tmdb_item_count: number | null;
  movie_count: number;
  series_count: number;
  tmdb_updated_at: string | null;
  remote_signature: string | null;
  status: "pending" | "ok" | "error" | "gone";
  last_error: string | null;
  consecutive_failures: number;
  next_attempt_at: Date | null;
  last_checked_at: Date | null;
  last_synced_at: Date | null;
  last_full_sync_at: Date | null;
  gone_at: Date | null;
}

export interface RemoteListInfo {
  kind: ListKind;
  tmdbListId: string;
  name: string;
  description: string | null;
  isPublic: boolean | null;
  itemCount: number | null;
  updatedAt: string | null;
}

export async function upsertRemoteLists(userId: string, remote: RemoteListInfo[], sql: Db = db()): Promise<ListRow[]> {
  if (remote.length === 0) return [];
  const rows = remote.map((r) => ({
    kind: r.kind,
    tmdb_list_id: r.tmdbListId,
    name: r.name,
    description: r.description,
    is_public: r.isPublic,
    item_count: r.itemCount,
    updated_at: r.updatedAt,
  }));
  return sql<ListRow[]>`
    insert into tmdb_lists (user_id, kind, tmdb_list_id, name, description, is_public, tmdb_item_count, tmdb_updated_at)
    select ${userId}, t.kind, t.tmdb_list_id, t.name, t.description, t.is_public, t.item_count, t.updated_at
    from jsonb_to_recordset(${sql.json(rows)}) as t(kind text, tmdb_list_id text, name text, description text,
                                                  is_public boolean, item_count int, updated_at text)
    on conflict (user_id, kind, tmdb_list_id) do update set
      name = excluded.name,
      description = excluded.description,
      is_public = excluded.is_public,
      tmdb_item_count = excluded.tmdb_item_count,
      tmdb_updated_at = excluded.tmdb_updated_at,
      status = case when tmdb_lists.status = 'gone' then 'pending' else tmdb_lists.status end,
      gone_at = null,
      updated_at = now()
    returning *`;
}

/**
 * Custom lists absent from a COMPLETE index fetch are marked "gone"
 * (hidden from Stremio, purged after 7 days). Watchlists always exist.
 */
export async function markMissingListsGone(userId: string, presentCustomIds: string[], sql: Db = db()): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    update tmdb_lists set status = 'gone', gone_at = coalesce(gone_at, now()), updated_at = now()
    where user_id = ${userId} and kind = 'custom' and status <> 'gone'
      and not (tmdb_list_id = any(${presentCustomIds}::text[]))
    returning id`;
  return rows.map((r) => r.id);
}

export interface SnapshotItem {
  media_type: MediaType;
  tmdb_id: number;
  position: number;
}

export interface SnapshotResult {
  added: number;
  removed: number;
  movieCount: number;
  seriesCount: number;
}

/**
 * Replaces the stored membership of a list with a complete, validated TMDB
 * snapshot, in ONE transaction: upsert current items, delete the ones no longer
 * present, update counters. Callers must only invoke this after every page was
 * fetched successfully — an error before this point leaves previous data intact.
 */
export async function applyListSnapshot(userId: string, list: Pick<ListRow, "id" | "kind">, items: SnapshotItem[], signature: string, sql = db()): Promise<SnapshotResult> {
  return sql.begin(async (tx) => {
    const payload = tx.json(items as never);
    const [ins] = await tx<{ added: number }[]>`
      with incoming as (
        select * from jsonb_to_recordset(${payload}) as t(media_type text, tmdb_id int, position int)
      ), up as (
        insert into list_items (list_id, user_id, media_type, tmdb_id, position)
        select ${list.id}, ${userId}, media_type, tmdb_id, position from incoming
        on conflict (list_id, media_type, tmdb_id) do update set position = excluded.position
        returning (xmax = 0) as inserted
      )
      select count(*) filter (where inserted)::int as added from up`;
    const del = await tx`
      delete from list_items li
      where li.list_id = ${list.id}
        and not exists (
          select 1 from jsonb_to_recordset(${payload}) as t(media_type text, tmdb_id int)
          where t.media_type = li.media_type and t.tmdb_id = li.tmdb_id)`;
    await tx`
      insert into tmdb_media (media_type, tmdb_id)
      select distinct media_type, tmdb_id from jsonb_to_recordset(${payload}) as t(media_type text, tmdb_id int)
      on conflict do nothing`;
    const movieCount = items.filter((i) => i.media_type === "movie").length;
    const seriesCount = items.length - movieCount;
    await tx`
      update tmdb_lists set movie_count = ${movieCount}, series_count = ${seriesCount},
        remote_signature = ${signature}, status = 'ok', last_error = null, consecutive_failures = 0,
        next_attempt_at = null, last_checked_at = now(), last_synced_at = now(), last_full_sync_at = now(), updated_at = now()
      where id = ${list.id} and user_id = ${userId}`;
    // Make sure a catalog row exists for every content type present (or the watchlist's own type).
    const types: MediaType[] =
      list.kind === "watchlist_movie" ? ["movie"] : list.kind === "watchlist_tv" ? ["tv"] : [...new Set(items.map((i) => i.media_type))];
    for (const t of types) {
      await tx`
        insert into selected_catalogs (user_id, list_id, media_type, position)
        values (${userId}, ${list.id}, ${t},
                (select coalesce(max(position), -1) + 1 from selected_catalogs where user_id = ${userId}))
        on conflict (list_id, media_type) do nothing`;
    }
    return { added: ins?.added ?? 0, removed: del.count, movieCount, seriesCount };
  });
}

export async function markListUnchanged(listId: string, sql: Db = db()): Promise<void> {
  await sql`update tmdb_lists set last_checked_at = now(), status = 'ok', last_error = null, consecutive_failures = 0, next_attempt_at = null where id = ${listId}`;
}

/** Records a failed attempt WITHOUT touching the stored items. */
export async function markListFailed(listId: string, message: string, sql: Db = db()): Promise<void> {
  await sql`
    update tmdb_lists set
      status = case when status = 'gone' then 'gone' else 'error' end,
      last_error = ${message}, last_checked_at = now(),
      consecutive_failures = consecutive_failures + 1,
      next_attempt_at = now() + least(interval '6 hours', interval '5 minutes' * power(2, least(consecutive_failures, 6))),
      updated_at = now()
    where id = ${listId}`;
}

// ------------------------------------------------------------------ UI queries
export interface ListWithCatalogs extends ListRow {
  catalogs: { id: string; media_type: MediaType; enabled: boolean; custom_name: string | null; position: number; visible_count: number }[];
}

export async function getListsForUser(userId: string, sql: Db = db()): Promise<ListWithCatalogs[]> {
  const lists = await sql<ListRow[]>`
    select * from tmdb_lists where user_id = ${userId}
    order by case kind when 'watchlist_movie' then 0 when 'watchlist_tv' then 1 else 2 end, lower(name)`;
  const catalogs = await sql<(ListWithCatalogs["catalogs"][number] & { list_id: string })[]>`
    select sc.id, sc.list_id, sc.media_type, sc.enabled, sc.custom_name, sc.position,
      (select count(*)::int from catalog_items ci where ci.catalog_id = sc.id) as visible_count
    from selected_catalogs sc where sc.user_id = ${userId} order by sc.position`;
  return lists.map((l) => ({ ...l, catalogs: catalogs.filter((c) => c.list_id === l.id).map(({ list_id: _ignored, ...c }) => c) }));
}

export async function updateCatalog(userId: string, catalogId: string, patch: { enabled?: boolean; customName?: string | null }, sql: Db = db()): Promise<boolean> {
  const rows = await sql`
    update selected_catalogs set
      enabled = coalesce(${patch.enabled ?? null}::boolean, enabled),
      custom_name = case when ${patch.customName !== undefined} then ${patch.customName ?? null} else custom_name end,
      updated_at = now()
    where id = ${catalogId} and user_id = ${userId}
    returning id`;
  return rows.length === 1;
}

export interface DashboardStats {
  lists: number;
  enabledCatalogs: number;
  movies: number;
  series: number;
  listsInError: number;
}

export async function getDashboardStats(userId: string, sql: Db = db()): Promise<DashboardStats> {
  const [row] = await sql<DashboardStats[]>`
    select
      (select count(*)::int from tmdb_lists where user_id = ${userId} and status <> 'gone') as lists,
      (select count(*)::int from selected_catalogs sc join tmdb_lists l on l.id = sc.list_id
        where sc.user_id = ${userId} and sc.enabled and l.status <> 'gone') as "enabledCatalogs",
      (select count(distinct li.tmdb_id)::int from list_items li join tmdb_lists l on l.id = li.list_id
        where li.user_id = ${userId} and li.media_type = 'movie' and l.status <> 'gone') as movies,
      (select count(distinct li.tmdb_id)::int from list_items li join tmdb_lists l on l.id = li.list_id
        where li.user_id = ${userId} and li.media_type = 'tv' and l.status <> 'gone') as series,
      (select count(*)::int from tmdb_lists where user_id = ${userId} and status = 'error') as "listsInError"`;
  return row!;
}
