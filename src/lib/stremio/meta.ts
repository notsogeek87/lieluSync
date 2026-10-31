import { backdropUrl, posterUrl, stillUrl } from "./images";
import { toStremioId, toStremioType } from "./ids";
import type { MediaType } from "@/lib/tmdb/schemas";

export interface CatalogItemRow {
  media_type: MediaType;
  tmdb_id: number;
  imdb_id: string | null;
  title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: Date | string | null;
  end_date: Date | string | null;
  in_production: boolean | null;
  genres: string[] | null;
  vote_average: string | number | null;
}

export interface MetaPreview {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  posterShape: "poster";
  background?: string;
  description?: string;
  releaseInfo?: string;
  genres?: string[];
  imdbRating?: string;
}

function year(d: Date | string | null): string | null {
  if (!d) return null;
  const s = d instanceof Date ? d.toISOString() : String(d);
  return /^\d{4}/.test(s) ? s.slice(0, 4) : null;
}

export function releaseInfo(row: Pick<CatalogItemRow, "media_type" | "release_date" | "end_date" | "in_production">): string | undefined {
  const start = year(row.release_date);
  if (!start) return undefined;
  if (row.media_type === "movie") return start;
  if (row.in_production) return `${start}-`;
  const end = year(row.end_date);
  return end && end !== start ? `${start}-${end}` : start;
}

function truncate(s: string | null, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function toMetaPreview(row: CatalogItemRow): MetaPreview {
  const rating = row.vote_average == null ? null : Number(row.vote_average);
  return {
    id: toStremioId(row),
    type: toStremioType(row.media_type),
    name: row.title,
    poster: posterUrl(row.poster_path),
    posterShape: "poster",
    background: backdropUrl(row.backdrop_path),
    description: truncate(row.overview, 600),
    releaseInfo: releaseInfo(row),
    genres: row.genres && row.genres.length ? row.genres.slice(0, 5) : undefined,
    imdbRating: rating && rating > 0 ? rating.toFixed(1) : undefined,
  };
}

/** Removes duplicates (two TMDB entries mapping to the same IMDb id) keeping order. */
export function dedupeMetas(metas: MetaPreview[]): MetaPreview[] {
  const seen = new Set<string>();
  return metas.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

export interface Episode {
  season: number;
  episode: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  stillPath: string | null;
}

/** Full meta object for "tmdb:" items (which Cinemeta cannot describe). */
export function toFullMeta(row: CatalogItemRow, episodes: Episode[] = []) {
  const base = toMetaPreview(row);
  const meta: Record<string, unknown> = { ...base, description: row.overview ?? undefined, logo: undefined };
  if (row.media_type === "tv") {
    meta.videos = episodes.map((e) => ({
      id: `${base.id}:${e.season}:${e.episode}`,
      title: e.name || `Épisode ${e.episode}`,
      season: e.season,
      episode: e.episode,
      released: e.airDate ? new Date(`${e.airDate}T00:00:00Z`).toISOString() : undefined,
      overview: e.overview ?? undefined,
      thumbnail: stillUrl(e.stillPath),
    }));
  } else {
    meta.behaviorHints = { defaultVideoId: base.id };
  }
  return meta;
}
