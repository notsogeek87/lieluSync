import { log } from "@/lib/log";
import { mapConcurrent } from "@/lib/tmdb/limiter";
import { isTmdbError } from "@/lib/tmdb/errors";
import type { TmdbClient } from "@/lib/tmdb/client";
import { normalizeMovie, normalizeTv } from "@/lib/tmdb/metadata";
import { markMediaError, markMediaNotFound, mediaNeedingRefresh, saveMedia } from "@/lib/repo/media";

/**
 * Resolves TMDB ids into Stremio-usable metadata (IMDb id, French title,
 * overview, poster). Shared across users, bounded by count and deadline.
 */
export async function resolveMedia(client: TmdbClient, opts: { userId: string | null; limit: number; deadline: number }): Promise<number> {
  const keys = await mediaNeedingRefresh(opts.limit, opts.userId);
  let resolved = 0;
  await mapConcurrent(keys, 6, async (key) => {
    if (Date.now() > opts.deadline) return;
    try {
      const rec = key.media_type === "movie" ? normalizeMovie(await client.getMovie(key.tmdb_id)) : normalizeTv(await client.getTv(key.tmdb_id));
      await saveMedia(rec);
      resolved++;
    } catch (err) {
      if (isTmdbError(err, "not_found")) {
        await markMediaNotFound(key);
      } else {
        log.warn("media.resolve_failed", { mediaType: key.media_type, tmdbId: key.tmdb_id, err });
        await markMediaError(key).catch(() => undefined);
      }
    }
  });
  return resolved;
}
