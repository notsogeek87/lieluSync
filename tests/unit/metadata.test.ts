import { describe, expect, it } from "vitest";
import { normalizeMovie, normalizeTv } from "@/lib/tmdb/metadata";
import { toSnapshot } from "@/lib/sync/items";
import { customListSignature, watchlistSignature } from "@/lib/sync/signature";

describe("French metadata with fallbacks", () => {
  it("prefers French title, overview and poster", () => {
    const r = normalizeMovie({
      id: 1, title: "Le Parrain", original_title: "The Godfather", overview: "Résumé FR", poster_path: "/en.jpg",
      images: { posters: [{ file_path: "/fr2.jpg", iso_639_1: "fr", vote_average: 4 }, { file_path: "/fr1.jpg", iso_639_1: "fr", vote_average: 6 }] },
      external_ids: { imdb_id: "tt0068646" }, release_date: "1972-03-14", genres: [{ id: 1, name: "Drame" }], vote_average: 8.7,
    });
    expect(r).toMatchObject({ title: "Le Parrain", overview: "Résumé FR", posterPath: "/fr1.jpg", imdbId: "tt0068646", releaseDate: "1972-03-14", genres: ["Drame"], voteAverage: 8.7 });
  });

  it("falls back to English then original data when French is missing", () => {
    const r = normalizeMovie({
      id: 2, title: "", original_title: "Oldboy", overview: "", poster_path: "/default.jpg", original_language: "ko",
      translations: { translations: [{ iso_639_1: "ko", data: { overview: "KO" } }, { iso_639_1: "en", data: { overview: "EN text" } }] },
    });
    expect(r.title).toBe("Oldboy");
    expect(r.overview).toBe("EN text");
    expect(r.posterPath).toBe("/default.jpg");
    expect(r.imdbId).toBeNull();
  });

  it("normalises TV shows", () => {
    const r = normalizeTv({ id: 3, name: "Le Bureau des légendes", original_name: "Le Bureau des légendes", first_air_date: "2015-04-27", last_air_date: "2020-12-07", in_production: false, external_ids: { imdb_id: "tt4063800" } });
    expect(r).toMatchObject({ mediaType: "tv", imdbId: "tt4063800", releaseDate: "2015-04-27", endDate: "2020-12-07" });
  });
});

describe("list snapshots", () => {
  it("separates types, drops persons and duplicates, keeps order", () => {
    const s = toSnapshot([
      { id: 1, media_type: "movie" }, { id: 2, media_type: "tv" }, { id: 3, media_type: "person" }, { id: 1, media_type: "movie" }, { id: 1, media_type: "tv" },
    ]);
    expect(s).toEqual([
      { media_type: "movie", tmdb_id: 1, position: 0 },
      { media_type: "tv", tmdb_id: 2, position: 1 },
      { media_type: "tv", tmdb_id: 1, position: 2 },
    ]);
  });

  it("uses the watchlist type when media_type is absent and filters others", () => {
    expect(toSnapshot([{ id: 5 }, { id: 6, media_type: "tv" }], "movie")).toEqual([{ media_type: "movie", tmdb_id: 5, position: 0 }]);
  });

  it("signatures change with content", () => {
    expect(customListSignature(3, "2024-01-01")).not.toBe(customListSignature(4, "2024-01-01"));
    const p = (ids: number[], total = ids.length) => ({ page: 1, total_pages: 1, total_results: total, results: ids.map((id) => ({ id })) });
    expect(watchlistSignature(p([1, 2]))).toBe(watchlistSignature(p([1, 2])));
    expect(watchlistSignature(p([3, 1, 2]))).not.toBe(watchlistSignature(p([1, 2])));
    expect(watchlistSignature(p([1, 2], 3))).not.toBe(watchlistSignature(p([1, 2], 2)));
  });
});
