import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, truncateAll, db, closeDb } from "../helpers/db";
import { setupFakeTmdb, connectedUser, APP, params } from "../helpers/world";
import { items, type FakeTmdb } from "../helpers/fake-tmdb";
import type { TmdbClient } from "@/lib/tmdb/client";
import { syncUser } from "@/lib/sync/engine";
import { GET as manifestRoute, OPTIONS } from "@/app/u/[token]/manifest.json/route";
import { GET as catalogRoute } from "@/app/u/[token]/catalog/[type]/[...rest]/route";
import { GET as metaRoute } from "@/app/u/[token]/meta/[type]/[id]/route";

let fake: FakeTmdb;
let client: TmdbClient;

beforeAll(async () => { await resetDatabase(); });
afterAll(async () => { await closeDb(); });
beforeEach(async () => { await truncateAll(); ({ fake, client } = setupFakeTmdb()); });

const req = (path: string) => new Request(`${APP}${path}`);
const manifest = (token: string) => manifestRoute(req(`/u/${token}/manifest.json`), params({ token }));
const catalog = (token: string, type: string, ...rest: string[]) => catalogRoute(req(`/u/${token}/catalog/${type}/${rest.join("/")}`), params({ token, type, rest }));

async function setup() {
  const u = await connectedUser(fake, "acc-1");
  u.account.watchlist.movie = items("movie", ...Array.from({ length: 130 }, (_, i) => i + 1));
  u.account.watchlist.tv = items("tv", 500);
  u.account.lists.push({ id: 7, name: "Charlie", items: [...items("movie", 1), ...items("tv", 501)], updated_at: "1", public: false });
  fake.setMedia("tv", 501, { title: "Sans IMDb", imdb: null });
  await syncUser(u.userId, "manual", { client, deadline: Date.now() + 30_000 });
  return u;
}

describe("Stremio addon", () => {
  it("serves a per-user manifest listing each enabled list/type as a catalog", async () => {
    const u = await setup();
    const res = await manifest(u.configToken);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const m = await res.json();
    expect(m.name).toBe("Lielu Lists");
    const summary = m.catalogs.map((c: any) => `${c.name}|${c.type}`).sort();
    expect(summary).toEqual(["Charlie|movie", "Charlie|series", "Ma Watchlist|movie", "Ma Watchlist|series"]);
    expect(JSON.stringify(m)).not.toContain(u.accessToken);
  });

  it("answers CORS preflight", async () => {
    const r = OPTIONS();
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("serves catalogs with IMDb ids, French posters and 100-item pagination", async () => {
    const u = await setup();
    const m = await (await manifest(u.configToken)).json();
    const wl = m.catalogs.find((c: any) => c.name === "Ma Watchlist" && c.type === "movie");

    const p1 = await catalog(u.configToken, "movie", `${wl.id}.json`);
    expect(p1.status).toBe(200);
    expect(p1.headers.get("cache-control")).toContain("max-age=300");
    const b1 = await p1.json();
    expect(b1.metas).toHaveLength(100);
    expect(b1.metas[0]).toMatchObject({ id: "tt1000001", type: "movie", posterShape: "poster" });
    expect(b1.metas[0].poster).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w342\//);

    const b2 = await (await catalog(u.configToken, "movie", wl.id, "skip=100.json")).json();
    expect(b2.metas).toHaveLength(30);
    expect(b2.metas[0].id).toBe("tt1000101");
  });

  it("keeps films and series in separate catalogs", async () => {
    const u = await setup();
    const m = await (await manifest(u.configToken)).json();
    const movies = m.catalogs.find((c: any) => c.name === "Charlie" && c.type === "movie");
    const series = m.catalogs.find((c: any) => c.name === "Charlie" && c.type === "series");
    const bm = await (await catalog(u.configToken, "movie", `${movies.id}.json`)).json();
    const bs = await (await catalog(u.configToken, "series", `${series.id}.json`)).json();
    expect(bm.metas.every((x: any) => x.type === "movie")).toBe(true);
    expect(bs.metas).toEqual([expect.objectContaining({ id: "tmdb:501", type: "series", name: "Sans IMDb" })]);
    // Asking a movie catalog with the series type returns nothing.
    expect((await catalog(u.configToken, "series", `${movies.id}.json`)).status).toBe(404);
  });

  it("serves meta (with episodes) for tmdb: items only", async () => {
    const u = await setup();
    const res = await metaRoute(req(""), params({ token: u.configToken, type: "series", id: "tmdb:501.json" }));
    expect(res.status).toBe(200);
    const { meta } = await res.json();
    expect(meta).toMatchObject({ id: "tmdb:501", type: "series", name: "Sans IMDb" });
    expect(meta.videos[0]).toMatchObject({ id: "tmdb:501:1:1", season: 1, episode: 1 });
    const imdb = await metaRoute(req(""), params({ token: u.configToken, type: "movie", id: "tt1000001.json" }));
    expect(imdb.status).toBe(404);
  });

  it("hides disabled catalogs and renamed ones use the custom name", async () => {
    const u = await setup();
    await db()`update selected_catalogs sc set enabled = false from tmdb_lists l where l.id = sc.list_id and l.name = 'Charlie' and sc.media_type = 'tv'`;
    await db()`update selected_catalogs sc set custom_name = 'Films de Charlie' from tmdb_lists l where l.id = sc.list_id and l.name = 'Charlie' and sc.media_type = 'movie'`;
    const m = await (await manifest(u.configToken)).json();
    const names = m.catalogs.map((c: any) => `${c.name}|${c.type}`);
    expect(names).toContain("Films de Charlie|movie");
    expect(names).not.toContain("Charlie|series");
  });

  it("isolates users: a configuration id only reaches its own catalogs", async () => {
    const a = await setup();
    const b = await connectedUser(fake, "acc-2");
    const ma = await (await manifest(a.configToken)).json();
    const res = await catalog(b.configToken, "movie", `${ma.catalogs[0].id}.json`);
    expect(res.status).toBe(404);
    expect((await res.json()).metas).toEqual([]);
    const metaB = await metaRoute(req(""), params({ token: b.configToken, type: "series", id: "tmdb:501.json" }));
    expect(metaB.status).toBe(404);
  });

  it("rejects unknown or malformed configuration ids", async () => {
    expect((await manifest("x".repeat(43))).status).toBe(404);
    expect((await manifest("../../etc/passwd")).status).toBe(404);
    expect((await catalog("nope", "movie", "ll-x.json")).status).toBe(404);
  });

  it("keeps serving the last good catalog while TMDB is down", async () => {
    const u = await setup();
    fake.fail(/.*/, 503, 1000);
    await syncUser(u.userId, "manual", { client, deadline: Date.now() + 30_000 });
    const m = await (await manifest(u.configToken)).json();
    const wl = m.catalogs.find((c: any) => c.name === "Ma Watchlist" && c.type === "movie");
    expect((await (await catalog(u.configToken, "movie", `${wl.id}.json`)).json()).metas).toHaveLength(100);
  });
});
