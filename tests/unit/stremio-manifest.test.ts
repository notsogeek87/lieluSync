import { describe, expect, it } from "vitest";
import { buildManifest } from "@/lib/stremio/manifest";
import { parseExtra, stremioJson } from "@/lib/stremio/http";

describe("Stremio manifest", () => {
  const m = buildManifest("https://lists.example", [
    { id: "11111111-1111-4111-8111-111111111111", media_type: "movie", name: "Ma Watchlist" },
    { id: "22222222-2222-4222-8222-222222222222", media_type: "tv", name: "Ma Watchlist" },
    { id: "33333333-3333-4333-8333-333333333333", media_type: "movie", name: "Charlie" },
  ]);

  it("contains the required fields of the addon protocol", () => {
    expect(m.id).toBe("eu.lielu.lists");
    expect(m.name).toBe("Lielu Lists");
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(m.description).toContain("Your TMDB lists in Stremio");
    expect(m.types).toEqual(["movie", "series"]);
    expect(m.resources).toContainEqual("catalog");
    expect(m.logo).toBe("https://lists.example/logo-256.png");
    expect(m.behaviorHints.configurable).toBe(true);
  });

  it("exposes one catalog per list and type, with pagination", () => {
    expect(m.catalogs).toHaveLength(3);
    expect(m.catalogs.map((c) => c.type)).toEqual(["movie", "series", "movie"]);
    for (const c of m.catalogs) {
      expect(c.id).toMatch(/^ll-[0-9a-f-]{36}$/);
      expect(c.extra).toEqual([{ name: "skip", isRequired: false }]);
    }
    expect(new Set(m.catalogs.map((c) => c.id)).size).toBe(3);
  });

  it("only serves meta for its own tmdb: prefix (IMDb items stay with Cinemeta)", () => {
    expect(m.resources).toContainEqual({ name: "meta", types: ["movie", "series"], idPrefixes: ["tmdb:"] });
  });
});

describe("Stremio HTTP helpers", () => {
  it("sends CORS and cache headers", () => {
    const r = stremioJson({ metas: [] }, { cache: { maxAge: 300, staleRevalidate: 900, staleError: 86400 } });
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("cache-control")).toBe("public, max-age=300, stale-while-revalidate=900, stale-if-error=86400");
    expect(r.headers.get("content-type")).toContain("application/json");
  });

  it("parses extra arguments", () => {
    expect(parseExtra("skip=100")).toEqual({ skip: "100" });
    expect(parseExtra("genre=Com%C3%A9die&skip=200")).toEqual({ genre: "Comédie", skip: "200" });
    expect(parseExtra(undefined)).toEqual({});
  });
});
