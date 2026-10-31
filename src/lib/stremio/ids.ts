import type { MediaType } from "@/lib/tmdb/schemas";

/**
 * Stremio identifiers.
 * - Stremio types are "movie" and "series"; TMDB uses "movie" and "tv".
 * - Items with an IMDb id are exposed as "tt…" so Cinemeta and every stream /
 *   subtitle addon understand them.
 * - Items without IMDb id fall back to "tmdb:{id}"; this addon serves their
 *   meta itself (declared through idPrefixes ["tmdb:"]).
 */
export type StremioType = "movie" | "series";

export const TMDB_PREFIX = "tmdb:";

export function toStremioType(t: MediaType): StremioType {
  return t === "tv" ? "series" : "movie";
}

export function fromStremioType(t: string): MediaType | null {
  if (t === "movie") return "movie";
  if (t === "series") return "tv";
  return null;
}

export function toStremioId(item: { imdb_id: string | null; tmdb_id: number }): string {
  if (item.imdb_id && /^tt\d{5,10}$/.test(item.imdb_id)) return item.imdb_id;
  return `${TMDB_PREFIX}${item.tmdb_id}`;
}

/** Parses "tmdb:123" (optionally ":season:episode" for video ids). */
export function parseTmdbId(id: string): number | null {
  const m = /^tmdb:(\d{1,10})(?::\d+:\d+)?$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Stremio catalog ids are opaque; we use "ll-" + selected_catalogs.id. */
export function catalogIdFor(catalogUuid: string): string {
  return `ll-${catalogUuid}`;
}

export function parseCatalogId(id: string): string | null {
  const m = /^ll-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(id);
  return m ? m[1]! : null;
}
