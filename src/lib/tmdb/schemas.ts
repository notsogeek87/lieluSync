import { z } from "zod";

/** Zod schemas for the subset of TMDB responses we consume (unknown keys are stripped). */

const nullableStr = z.string().nullable().optional();

export const genericStatus = z.object({ success: z.boolean().optional(), status_code: z.number().optional() });

export const requestTokenResponse = z.object({
  success: z.boolean().optional(),
  request_token: z.string().min(10),
});

export const accessTokenResponse = z.object({
  success: z.boolean().optional(),
  access_token: z.string().min(10),
  account_id: z.string().min(1),
});

export const sessionConvertResponse = z.object({
  success: z.boolean().optional(),
  session_id: z.string().min(10),
});

export const accountDetailsResponse = z.object({
  id: z.number().int(),
  username: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  avatar: z
    .object({
      tmdb: z.object({ avatar_path: nullableStr }).nullable().optional(),
      gravatar: z.object({ hash: nullableStr }).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const mediaTypeSchema = z.enum(["movie", "tv"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

/** Item as returned by v4 list / watchlist endpoints. Persons and unknown types are tolerated then filtered. */
export const listItem = z.object({
  id: z.number().int().positive(),
  media_type: z.string().optional(),
  title: nullableStr,
  name: nullableStr,
  poster_path: nullableStr,
});
export type TmdbListItem = z.infer<typeof listItem>;

export const pagedItems = z.object({
  page: z.number().int(),
  total_pages: z.number().int().nonnegative(),
  total_results: z.number().int().nonnegative(),
  results: z.array(listItem),
});
export type PagedItems = z.infer<typeof pagedItems>;

export const listDetails = pagedItems.extend({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  description: nullableStr,
  public: z.union([z.boolean(), z.number()]).optional(),
  item_count: z.number().int().nonnegative().optional(),
});
export type ListDetails = z.infer<typeof listDetails>;

export const accountListSummary = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  description: nullableStr,
  number_of_items: z.number().int().nonnegative().optional(),
  public: z.union([z.boolean(), z.number()]).optional(),
  updated_at: nullableStr,
});
export type AccountListSummary = z.infer<typeof accountListSummary>;

export const accountLists = z.object({
  page: z.number().int(),
  total_pages: z.number().int().nonnegative(),
  total_results: z.number().int().nonnegative(),
  results: z.array(accountListSummary),
});

const image = z.object({
  file_path: z.string(),
  iso_639_1: z.string().nullable().optional(),
  vote_average: z.number().optional(),
});

const translation = z.object({
  iso_639_1: z.string(),
  iso_3166_1: z.string().optional(),
  data: z
    .object({ title: nullableStr, name: nullableStr, overview: nullableStr })
    .partial()
    .optional(),
});

const common = {
  id: z.number().int().positive(),
  overview: nullableStr,
  poster_path: nullableStr,
  backdrop_path: nullableStr,
  original_language: nullableStr,
  genres: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  vote_average: z.number().nullable().optional(),
  external_ids: z.object({ imdb_id: nullableStr }).partial().optional(),
  translations: z.object({ translations: z.array(translation) }).optional(),
  images: z.object({ posters: z.array(image).optional() }).optional(),
};

export const movieDetails = z.object({
  ...common,
  title: nullableStr,
  original_title: nullableStr,
  release_date: nullableStr,
  runtime: z.number().nullable().optional(),
  imdb_id: nullableStr,
});
export type MovieDetails = z.infer<typeof movieDetails>;

export const tvDetails = z.object({
  ...common,
  name: nullableStr,
  original_name: nullableStr,
  first_air_date: nullableStr,
  last_air_date: nullableStr,
  in_production: z.boolean().optional(),
  episode_run_time: z.array(z.number()).optional(),
  seasons: z
    .array(z.object({ season_number: z.number().int(), episode_count: z.number().int().optional() }))
    .optional(),
});
export type TvDetails = z.infer<typeof tvDetails>;

export const seasonDetails = z.object({
  season_number: z.number().int(),
  episodes: z.array(
    z.object({
      episode_number: z.number().int(),
      season_number: z.number().int(),
      name: nullableStr,
      overview: nullableStr,
      air_date: nullableStr,
      still_path: nullableStr,
    }),
  ),
});
export type SeasonDetails = z.infer<typeof seasonDetails>;
