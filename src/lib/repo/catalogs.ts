import { db, type Db } from "@/lib/db/client";
import type { MediaType } from "@/lib/tmdb/schemas";
import type { CatalogItemRow } from "@/lib/stremio/meta";

export interface EnabledCatalog {
  id: string;
  media_type: MediaType;
  name: string;
}

/** Catalogs exposed in the user's manifest (enabled, list still exists on TMDB). */
export async function getEnabledCatalogs(userId: string, sql: Db = db()): Promise<EnabledCatalog[]> {
  return sql<EnabledCatalog[]>`
    select sc.id, sc.media_type, coalesce(sc.custom_name, l.name) as name
    from selected_catalogs sc
    join tmdb_lists l on l.id = sc.list_id
    where sc.user_id = ${userId} and sc.enabled and l.status <> 'gone'
    order by sc.position, lower(coalesce(sc.custom_name, l.name))`;
}

export const STREMIO_PAGE_SIZE = 100;

/**
 * One page of a catalog. Returns null if the catalog does not belong to this
 * user, is disabled or of another type — callers answer with an empty list.
 */
export async function getCatalogPage(userId: string, catalogId: string, mediaType: MediaType, skip: number, sql: Db = db()): Promise<CatalogItemRow[] | null> {
  const [owner] = await sql<{ id: string }[]>`
    select sc.id from selected_catalogs sc join tmdb_lists l on l.id = sc.list_id
    where sc.id = ${catalogId} and sc.user_id = ${userId} and sc.media_type = ${mediaType} and sc.enabled and l.status <> 'gone'`;
  if (!owner) return null;
  return sql<CatalogItemRow[]>`
    select media_type, tmdb_id, imdb_id, title, overview, poster_path, backdrop_path, release_date, end_date, in_production, genres, vote_average
    from catalog_items
    where catalog_id = ${catalogId} and user_id = ${userId}
    order by position, tmdb_id
    offset ${skip} limit ${STREMIO_PAGE_SIZE}`;
}

/** Metadata for an item, only if it belongs to one of this user's lists. */
export async function getUserMedia(userId: string, mediaType: MediaType, tmdbId: number, sql: Db = db()): Promise<CatalogItemRow | null> {
  const [row] = await sql<CatalogItemRow[]>`
    select m.media_type, m.tmdb_id, m.imdb_id, m.title, m.overview, m.poster_path, m.backdrop_path, m.release_date, m.end_date,
           m.in_production, m.genres, m.vote_average
    from tmdb_media m
    where m.media_type = ${mediaType} and m.tmdb_id = ${tmdbId} and m.title is not null and m.status <> 'not_found'
      and exists (select 1 from list_items li where li.user_id = ${userId} and li.media_type = m.media_type and li.tmdb_id = m.tmdb_id)`;
  return row ?? null;
}
