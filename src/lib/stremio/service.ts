import { env } from "@/lib/config/env";
import { log } from "@/lib/log";
import { runInBackground } from "@/lib/background";
import { getUserByConfigToken, getUserById, type UserRow } from "@/lib/repo/users";
import { getProfileByToken } from "@/lib/repo/profiles";
import { getCatalogPage, getEnabledCatalogs, getUserMedia } from "@/lib/repo/catalogs";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { syncUser } from "@/lib/sync/engine";
import { tmdb } from "@/lib/tmdb";
import { mapConcurrent } from "@/lib/tmdb/limiter";
import { buildManifest } from "./manifest";
import { dedupeMetas, toFullMeta, toMetaPreview, type Episode } from "./meta";
import { fromStremioType, parseCatalogId, parseTmdbId } from "./ids";
import { parseExtra, stremioJson } from "./http";

const CATALOG_CACHE = { maxAge: 300, staleRevalidate: 900, staleError: 86400 };
const MANIFEST_CACHE = { maxAge: 300, staleRevalidate: 3600, staleError: 86400 };
const META_CACHE = { maxAge: 21600, staleRevalidate: 86400, staleError: 604800 };

type Resolved = { user: UserRow; profile: { id: string; name: string } | null } | { response: Response };

async function resolve(req: Request, token: string): Promise<Resolved> {
  const rl = await rateLimit(`addon:${clientIp(req.headers)}`, 300, 60);
  if (!rl.allowed) return { response: stremioJson({ error: "rate_limited" }, { status: 429 }) };
  const user = await getUserByConfigToken(token);
  if (user) return { user, profile: null };
  // Not the main URL: it may be a profile URL (same user, restricted catalogs).
  const profile = await getProfileByToken(token);
  const owner = profile ? await getUserById(profile.user_id) : null;
  if (!profile || !owner) return { response: stremioJson({ error: "unknown_configuration" }, { status: 404 }) };
  return { user: owner, profile: { id: profile.id, name: profile.name } };
}

/**
 * On-demand freshness: if the scheduler missed runs (cron failure, delay,
 * Hobby plan…), a catalog request triggers a background sync. The lease lock
 * and next_sync_at check make this a no-op when a sync is already running/recent.
 */
function maybeRefresh(user: UserRow): void {
  const interval = env().SYNC_INTERVAL_MINUTES * 60_000;
  const last = user.last_successful_sync_at?.getTime() ?? 0;
  const due = user.next_sync_at.getTime() <= Date.now();
  const locked = user.sync_lock_until && user.sync_lock_until.getTime() > Date.now();
  if (user.sync_enabled && due && !locked && Date.now() - last > 2 * interval) {
    runInBackground("stale-sync", () => syncUser(user.id, "stale", { deadline: Date.now() + 45_000 }));
  }
}

export async function handleManifest(req: Request, token: string): Promise<Response> {
  try {
    const r = await resolve(req, token);
    if ("response" in r) return r.response;
    const catalogs = await getEnabledCatalogs(r.user.id, r.profile?.id ?? null);
    return stremioJson(buildManifest(env().APP_URL, catalogs, r.profile ?? undefined), { cache: MANIFEST_CACHE });
  } catch (err) {
    log.error("addon.manifest_failed", { err });
    return stremioJson({ error: "unavailable" }, { status: 503 });
  }
}

/** Handles /catalog/{type}/{id}.json and /catalog/{type}/{id}/{extra}.json */
export async function handleCatalog(req: Request, token: string, type: string, rest: string[]): Promise<Response> {
  try {
    const r = await resolve(req, token);
    if ("response" in r) return r.response;
    const mediaType = fromStremioType(type);
    const last = rest[rest.length - 1] ?? "";
    if (!mediaType || rest.length < 1 || rest.length > 2 || !last.endsWith(".json")) {
      return stremioJson({ metas: [] }, { status: 404 });
    }
    const rawId = rest.length === 1 ? last.slice(0, -5) : rest[0]!;
    const extra = rest.length === 2 ? parseExtra(last.slice(0, -5)) : {};
    const catalogId = parseCatalogId(decodeURIComponent(rawId));
    if (!catalogId) return stremioJson({ metas: [] }, { status: 404 });
    const skip = Math.min(100_000, Math.max(0, Math.floor(Number(extra.skip ?? 0)) || 0));

    maybeRefresh(r.user);
    const rows = await getCatalogPage(r.user.id, catalogId, mediaType, skip, r.profile?.id ?? null);
    if (!rows) return stremioJson({ metas: [] }, { status: 404 });
    return stremioJson({ metas: dedupeMetas(rows.map(toMetaPreview)) }, { cache: CATALOG_CACHE });
  } catch (err) {
    log.error("addon.catalog_failed", { err });
    // Short cache so clients keep their last good copy (stale-if-error) and retry soon.
    return stremioJson({ metas: [], error: "unavailable" }, { status: 503 });
  }
}

async function loadEpisodes(tvId: number): Promise<Episode[]> {
  const client = tmdb();
  const show = await client.getTv(tvId);
  const seasons = (show.seasons ?? []).map((s) => s.season_number).filter((n) => n >= 0).slice(0, 60);
  const details = await mapConcurrent(seasons, 4, (n) => client.getSeason(tvId, n).catch(() => null));
  return details.flatMap((s) =>
    (s?.episodes ?? []).map((e) => ({
      season: e.season_number,
      episode: e.episode_number,
      name: e.name ?? null,
      overview: e.overview ?? null,
      airDate: e.air_date ?? null,
      stillPath: e.still_path ?? null,
    })),
  );
}

/** Meta for "tmdb:" ids (titles without IMDb id). IMDb items are described by Cinemeta. */
export async function handleMeta(req: Request, token: string, type: string, idWithExt: string): Promise<Response> {
  try {
    const r = await resolve(req, token);
    if ("response" in r) return r.response;
    const mediaType = fromStremioType(type);
    const id = decodeURIComponent(idWithExt.replace(/\.json$/, ""));
    const tmdbId = parseTmdbId(id);
    if (!mediaType || !tmdbId) return stremioJson({ meta: null }, { status: 404 });
    const row = await getUserMedia(r.user.id, mediaType, tmdbId);
    if (!row) return stremioJson({ meta: null }, { status: 404 });
    // The id requested is tmdb:…; keep it even if an IMDb id appeared since.
    const episodes = mediaType === "tv" ? await loadEpisodes(tmdbId).catch(() => []) : [];
    const meta = toFullMeta({ ...row, imdb_id: null }, episodes);
    return stremioJson({ meta }, { cache: META_CACHE });
  } catch (err) {
    log.error("addon.meta_failed", { err });
    return stremioJson({ meta: null, error: "unavailable" }, { status: 503 });
  }
}
