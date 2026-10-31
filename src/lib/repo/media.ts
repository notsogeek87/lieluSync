import { db, type Db } from "@/lib/db/client";
import type { MediaRecord } from "@/lib/tmdb/metadata";
import type { MediaType } from "@/lib/tmdb/schemas";

export interface MediaKey {
  media_type: MediaType;
  tmdb_id: number;
}

/** Media needing a (re)fetch, scoped to one user's lists or to all lists. */
export async function mediaNeedingRefresh(limit: number, userId: string | null, sql: Db = db()): Promise<MediaKey[]> {
  return sql<MediaKey[]>`
    select m.media_type, m.tmdb_id from tmdb_media m
    where m.refresh_after <= now()
      and exists (select 1 from list_items li where li.media_type = m.media_type and li.tmdb_id = m.tmdb_id
                  ${userId ? sql`and li.user_id = ${userId}` : sql``})
    order by (m.status = 'pending') desc, m.refresh_after asc
    limit ${limit}`;
}

function ttlFor(rec: MediaRecord): string {
  if (!rec.imdbId) return "2 days"; // IMDb ids are frequently added later
  if (rec.mediaType === "tv" && rec.inProduction) return "3 days";
  return "7 days";
}

export async function saveMedia(rec: MediaRecord, sql: Db = db()): Promise<void> {
  await sql`
    insert into tmdb_media (media_type, tmdb_id, status, imdb_id, title, original_title, overview, poster_path, backdrop_path,
                            release_date, end_date, in_production, genres, vote_average, runtime, fetched_at, refresh_after, error_count)
    values (${rec.mediaType}, ${rec.tmdbId}, 'ok', ${rec.imdbId}, ${rec.title}, ${rec.originalTitle}, ${rec.overview}, ${rec.posterPath},
            ${rec.backdropPath}, ${rec.releaseDate}, ${rec.endDate}, ${rec.inProduction}, ${rec.genres}, ${rec.voteAverage}, ${rec.runtime},
            now(), now() + ${ttlFor(rec)}::interval + random() * interval '6 hours', 0)
    on conflict (media_type, tmdb_id) do update set
      status = 'ok', imdb_id = excluded.imdb_id, title = excluded.title, original_title = excluded.original_title,
      overview = excluded.overview, poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path,
      release_date = excluded.release_date, end_date = excluded.end_date, in_production = excluded.in_production,
      genres = excluded.genres, vote_average = excluded.vote_average, runtime = excluded.runtime,
      fetched_at = now(), refresh_after = excluded.refresh_after, error_count = 0`;
}

/** TMDB says the title does not exist (anymore): hide it, re-check weekly. */
export async function markMediaNotFound(key: MediaKey, sql: Db = db()): Promise<void> {
  await sql`update tmdb_media set status = 'not_found', fetched_at = now(), refresh_after = now() + interval '7 days'
            where media_type = ${key.media_type} and tmdb_id = ${key.tmdb_id}`;
}

/** Transient error: keep previously fetched metadata, retry with backoff. */
export async function markMediaError(key: MediaKey, sql: Db = db()): Promise<void> {
  await sql`
    update tmdb_media set
      status = case when status = 'pending' then 'error' else status end,
      error_count = error_count + 1,
      refresh_after = now() + least(interval '24 hours', interval '10 minutes' * power(2, least(error_count, 8)))
    where media_type = ${key.media_type} and tmdb_id = ${key.tmdb_id}`;
}
