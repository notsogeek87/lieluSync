import type { MediaType, MovieDetails, TvDetails } from "./schemas";

/** Normalised metadata stored in tmdb_media. French first, original/English as fallback. */
export interface MediaRecord {
  mediaType: MediaType;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  endDate: string | null;
  inProduction: boolean | null;
  genres: string[];
  voteAverage: number | null;
  runtime: number | null;
}

const IMDB_RE = /^tt\d{5,10}$/;

export function normalizeImdbId(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return IMDB_RE.test(v) ? v : null;
}

function nonEmpty(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function validDate(v: string | null | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

type Translations = NonNullable<MovieDetails["translations"]>["translations"];

/** Overview fallback chain: fr → en → original language → any. */
function pickOverview(primary: string | null | undefined, translations: Translations | undefined, originalLanguage: string | null | undefined): string | null {
  const fr = nonEmpty(primary);
  if (fr) return fr;
  const list = translations ?? [];
  const by = (lang: string | null | undefined) => (lang ? nonEmpty(list.find((t) => t.iso_639_1 === lang)?.data?.overview) : null);
  return by("en") ?? by(originalLanguage) ?? list.map((t) => nonEmpty(t.data?.overview)).find(Boolean) ?? null;
}

/** Prefer a French poster, then the default poster chosen by TMDB. */
function pickPoster(defaultPath: string | null | undefined, posters: { file_path: string; iso_639_1?: string | null; vote_average?: number }[] | undefined): string | null {
  const fr = (posters ?? []).filter((p) => p.iso_639_1 === "fr").sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))[0];
  return fr?.file_path ?? nonEmpty(defaultPath);
}

function frTitle(translations: Translations | undefined, key: "title" | "name"): string | null {
  return nonEmpty(translations?.find((t) => t.iso_639_1 === "fr" && t.iso_3166_1 === "FR")?.data?.[key]) ?? nonEmpty(translations?.find((t) => t.iso_639_1 === "fr")?.data?.[key]);
}

export function normalizeMovie(d: MovieDetails): MediaRecord {
  const translations = d.translations?.translations;
  const title = nonEmpty(d.title) ?? frTitle(translations, "title") ?? nonEmpty(d.original_title) ?? `TMDB ${d.id}`;
  return {
    mediaType: "movie",
    tmdbId: d.id,
    imdbId: normalizeImdbId(d.external_ids?.imdb_id ?? d.imdb_id),
    title,
    originalTitle: nonEmpty(d.original_title),
    overview: pickOverview(d.overview, translations, d.original_language),
    posterPath: pickPoster(d.poster_path, d.images?.posters),
    backdropPath: nonEmpty(d.backdrop_path),
    releaseDate: validDate(d.release_date),
    endDate: null,
    inProduction: null,
    genres: (d.genres ?? []).map((g) => g.name),
    voteAverage: typeof d.vote_average === "number" && d.vote_average > 0 ? Math.round(d.vote_average * 10) / 10 : null,
    runtime: d.runtime ?? null,
  };
}

export function normalizeTv(d: TvDetails): MediaRecord {
  const translations = d.translations?.translations;
  const title = nonEmpty(d.name) ?? frTitle(translations, "name") ?? nonEmpty(d.original_name) ?? `TMDB ${d.id}`;
  return {
    mediaType: "tv",
    tmdbId: d.id,
    imdbId: normalizeImdbId(d.external_ids?.imdb_id),
    title,
    originalTitle: nonEmpty(d.original_name),
    overview: pickOverview(d.overview, translations, d.original_language),
    posterPath: pickPoster(d.poster_path, d.images?.posters),
    backdropPath: nonEmpty(d.backdrop_path),
    releaseDate: validDate(d.first_air_date),
    endDate: validDate(d.last_air_date),
    inProduction: d.in_production ?? null,
    genres: (d.genres ?? []).map((g) => g.name),
    voteAverage: typeof d.vote_average === "number" && d.vote_average > 0 ? Math.round(d.vote_average * 10) / 10 : null,
    runtime: d.episode_run_time?.[0] ?? null,
  };
}
