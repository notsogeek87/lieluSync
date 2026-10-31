import { describe, expect, it } from "vitest";
import { catalogIdFor, fromStremioType, parseCatalogId, parseTmdbId, toStremioId, toStremioType } from "@/lib/stremio/ids";
import { normalizeImdbId } from "@/lib/tmdb/metadata";

describe("TMDB → Stremio id conversion", () => {
  it("uses the IMDb id when TMDB provides a valid one", () => {
    expect(toStremioId({ imdb_id: "tt0111161", tmdb_id: 278 })).toBe("tt0111161");
  });

  it("falls back to tmdb:{id} without IMDb id", () => {
    expect(toStremioId({ imdb_id: null, tmdb_id: 278 })).toBe("tmdb:278");
    expect(toStremioId({ imdb_id: "", tmdb_id: 5 })).toBe("tmdb:5");
    expect(toStremioId({ imdb_id: "nm0000123", tmdb_id: 5 })).toBe("tmdb:5");
  });

  it("validates IMDb ids coming from TMDB", () => {
    expect(normalizeImdbId(" tt1234567 ")).toBe("tt1234567");
    expect(normalizeImdbId("tt12")).toBeNull();
    expect(normalizeImdbId("1234567")).toBeNull();
    expect(normalizeImdbId(null)).toBeNull();
  });

  it("maps types both ways", () => {
    expect(toStremioType("movie")).toBe("movie");
    expect(toStremioType("tv")).toBe("series");
    expect(fromStremioType("series")).toBe("tv");
    expect(fromStremioType("movie")).toBe("movie");
    expect(fromStremioType("channel")).toBeNull();
  });

  it("parses tmdb ids and video ids strictly", () => {
    expect(parseTmdbId("tmdb:1399")).toBe(1399);
    expect(parseTmdbId("tmdb:1399:1:2")).toBe(1399);
    expect(parseTmdbId("tmdb:abc")).toBeNull();
    expect(parseTmdbId("tt0111161")).toBeNull();
    expect(parseTmdbId("tmdb:0")).toBeNull();
  });

  it("round-trips catalog ids and rejects garbage", () => {
    const uuid = "3f2c1b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
    expect(parseCatalogId(catalogIdFor(uuid))).toBe(uuid);
    expect(parseCatalogId("ll-../../etc")).toBeNull();
    expect(parseCatalogId("top")).toBeNull();
  });
});
