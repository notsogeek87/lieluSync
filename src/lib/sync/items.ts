import type { TmdbListItem, MediaType } from "@/lib/tmdb/schemas";
import type { SnapshotItem } from "@/lib/repo/lists";

/**
 * Converts raw TMDB list results into an ordered, de-duplicated snapshot.
 * Only movies and TV shows are kept (persons / unknown types are dropped).
 * Watchlist items may omit media_type: the watchlist's own type is used.
 */
export function toSnapshot(results: TmdbListItem[], defaultType?: MediaType): SnapshotItem[] {
  const seen = new Set<string>();
  const out: SnapshotItem[] = [];
  for (const r of results) {
    const t = (r.media_type ?? defaultType) as string | undefined;
    if (t !== "movie" && t !== "tv") continue;
    if (defaultType && t !== defaultType) continue;
    const key = `${t}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ media_type: t, tmdb_id: r.id, position: out.length });
  }
  return out;
}
