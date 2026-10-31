import { describe, expect, it } from "vitest";
import { dedupeMetas, releaseInfo, toFullMeta, toMetaPreview, type CatalogItemRow } from "@/lib/stremio/meta";

const base: CatalogItemRow = {
  media_type: "movie", tmdb_id: 27205, imdb_id: "tt1375666", title: "Inception", overview: "Un voleur…",
  poster_path: "/p.jpg", backdrop_path: "/b.jpg", release_date: "2010-07-15", end_date: null, in_production: null,
  genres: ["Action", "Science-Fiction"], vote_average: "8.4",
};

describe("meta previews", () => {
  it("builds a valid movie preview with French data", () => {
    const m = toMetaPreview(base);
    expect(m).toMatchObject({
      id: "tt1375666", type: "movie", name: "Inception", posterShape: "poster",
      poster: "https://image.tmdb.org/t/p/w342/p.jpg", releaseInfo: "2010", imdbRating: "8.4", description: "Un voleur…",
    });
  });

  it("formats series release info", () => {
    expect(releaseInfo({ media_type: "tv", release_date: "2011-04-17", end_date: "2019-05-19", in_production: false })).toBe("2011-2019");
    expect(releaseInfo({ media_type: "tv", release_date: "2020-01-01", end_date: null, in_production: true })).toBe("2020-");
    expect(releaseInfo({ media_type: "movie", release_date: null, end_date: null, in_production: null })).toBeUndefined();
  });

  it("never mixes types: tv rows become series", () => {
    expect(toMetaPreview({ ...base, media_type: "tv", imdb_id: null, tmdb_id: 1399 })).toMatchObject({ id: "tmdb:1399", type: "series" });
  });

  it("dedupes identical ids keeping order", () => {
    const a = toMetaPreview(base);
    const b = toMetaPreview({ ...base, tmdb_id: 1 });
    const c = toMetaPreview({ ...base, imdb_id: "tt0000001" });
    expect(dedupeMetas([a, b, c]).map((m) => m.id)).toEqual(["tt1375666", "tt0000001"]);
  });

  it("builds series videos for tmdb: items", () => {
    const meta = toFullMeta({ ...base, media_type: "tv", imdb_id: null, tmdb_id: 9 }, [
      { season: 1, episode: 1, name: "Pilote", overview: null, airDate: "2019-01-01", stillPath: null },
    ]) as any;
    expect(meta.videos[0]).toMatchObject({ id: "tmdb:9:1:1", season: 1, episode: 1, title: "Pilote" });
  });
});
