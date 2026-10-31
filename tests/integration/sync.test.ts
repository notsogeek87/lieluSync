import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, truncateAll, db, closeDb } from "../helpers/db";
import { setupFakeTmdb, connectedUser } from "../helpers/world";
import { items, type FakeTmdb } from "../helpers/fake-tmdb";
import type { TmdbClient } from "@/lib/tmdb/client";
import { syncUser } from "@/lib/sync/engine";
import { runCronTick } from "@/lib/sync/cron";
import { acquireUserLock } from "@/lib/repo/sync";

let fake: FakeTmdb;
let client: TmdbClient;

beforeAll(async () => { await resetDatabase(); });
afterAll(async () => { await closeDb(); });
beforeEach(async () => { await truncateAll(); ({ fake, client } = setupFakeTmdb()); });

const sync = (userId: string, trigger: "cron" | "manual" = "cron") => syncUser(userId, trigger, { client, deadline: Date.now() + 30_000 });

async function stored(userId: string, kind: string, tmdbListId: string) {
  return db()<{ media_type: string; tmdb_id: number; position: number }[]>`
    select li.media_type, li.tmdb_id, li.position from list_items li join tmdb_lists l on l.id = li.list_id
    where l.user_id = ${userId} and l.kind = ${kind} and l.tmdb_list_id = ${tmdbListId} order by li.position`;
}

describe("synchronisation", () => {
  it("discovers watchlists and custom lists, with pagination", async () => {
    const u = await connectedUser(fake, "acc-1");
    u.account.watchlist.movie = items("movie", ...Array.from({ length: 45 }, (_, i) => i + 1));
    u.account.watchlist.tv = items("tv", 100, 101);
    u.account.lists.push({ id: 7, name: "Charlie", items: [...items("movie", 1, 2), ...items("tv", 100)], updated_at: "1", public: false });
    u.account.lists.push({ id: 8, name: "Vide", items: [], updated_at: "1", public: true });

    const r = await sync(u.userId);
    expect(r.status).toBe("success");
    expect(await stored(u.userId, "watchlist_movie", "movie")).toHaveLength(45);
    expect((await stored(u.userId, "watchlist_movie", "movie"))[0]).toMatchObject({ tmdb_id: 1, position: 0 });
    expect(await stored(u.userId, "watchlist_tv", "tv")).toHaveLength(2);
    expect(await stored(u.userId, "custom", "8")).toHaveLength(0);

    const lists = await db()`select kind, name, movie_count, series_count, status from tmdb_lists where user_id = ${u.userId} order by kind, name`;
    expect(lists).toContainEqual(expect.objectContaining({ kind: "custom", name: "Charlie", movie_count: 2, series_count: 1, status: "ok" }));

    // A mixed list yields two separate catalogs (films / séries); an empty one none.
    const cats = await db()`select l.name, sc.media_type from selected_catalogs sc join tmdb_lists l on l.id = sc.list_id where sc.user_id = ${u.userId} order by l.name, sc.media_type`;
    expect(cats.filter((c) => c.name === "Charlie").map((c) => c.media_type)).toEqual(["movie", "tv"]);
    expect(cats.filter((c) => c.name === "Vide")).toHaveLength(0);

    // Metadata resolved with IMDb ids.
    const [m] = await db()`select status, imdb_id from tmdb_media where media_type = 'movie' and tmdb_id = 1`;
    expect(m).toMatchObject({ status: "ok", imdb_id: "tt1000001" });
  });

  it("reflects additions and deletions exactly, without duplicates", async () => {
    const u = await connectedUser(fake, "acc-1");
    const list = { id: 7, name: "Films à voir", items: items("movie", 1, 2, 3), updated_at: "1", public: false };
    u.account.lists.push(list);
    await sync(u.userId);

    list.items = items("movie", 4, 1, 3); // 2 removed, 4 added at the top
    fake.touch(list);
    const r = await sync(u.userId);
    expect(r).toMatchObject({ itemsAdded: 1, itemsRemoved: 1 });
    expect((await stored(u.userId, "custom", "7")).map((i) => i.tmdb_id)).toEqual([4, 1, 3]);

    // Re-running does not duplicate anything.
    await sync(u.userId, "manual");
    expect(await stored(u.userId, "custom", "7")).toHaveLength(3);
  });

  it("detects watchlist removals (no updated_at available)", async () => {
    const u = await connectedUser(fake, "acc-1");
    u.account.watchlist.movie = items("movie", 1, 2, 3);
    await sync(u.userId);
    u.account.watchlist.movie = items("movie", 1, 3);
    await sync(u.userId);
    expect((await stored(u.userId, "watchlist_movie", "movie")).map((i) => i.tmdb_id)).toEqual([1, 3]);
  });

  it("keeps previous data when TMDB fails mid-pagination", async () => {
    const u = await connectedUser(fake, "acc-1");
    const list = { id: 7, name: "Grosse liste", items: items("movie", ...Array.from({ length: 50 }, (_, i) => i + 1)), updated_at: "1", public: false };
    u.account.lists.push(list);
    await sync(u.userId);

    list.items = list.items.slice(0, 10);
    fake.touch(list);
    fake.fail(/GET \/4\/list\/7/, 500, 10); // every retry fails
    const r = await sync(u.userId);
    expect(r.status).toBe("partial");
    expect(await stored(u.userId, "custom", "7")).toHaveLength(50); // nothing deleted
    const [l] = await db()`select status, last_error, consecutive_failures from tmdb_lists where tmdb_list_id = '7'`;
    expect(l).toMatchObject({ status: "error", consecutive_failures: 1 });

    // Next successful run applies the real change.
    fake.failures = [];
    await sync(u.userId, "manual");
    expect(await stored(u.userId, "custom", "7")).toHaveLength(10);
  });

  it("never marks lists as deleted when the index cannot be read", async () => {
    const u = await connectedUser(fake, "acc-1");
    u.account.lists.push({ id: 7, name: "A", items: items("movie", 1), updated_at: "1", public: false });
    await sync(u.userId);
    fake.fail(/\/lists$/, 503, 10);
    const r = await sync(u.userId);
    expect(r.status).toBe("failed");
    const [l] = await db()`select status from tmdb_lists where tmdb_list_id = '7'`;
    expect(l!.status).toBe("ok");
    expect(await stored(u.userId, "custom", "7")).toHaveLength(1);
    const [usr] = await db()`select consecutive_failures, next_sync_at > now() as later from users where id = ${u.userId}`;
    expect(usr).toMatchObject({ consecutive_failures: 1, later: true });
  });

  it("marks lists deleted on TMDB as gone (hidden), and restores them if they come back", async () => {
    const u = await connectedUser(fake, "acc-1");
    const list = { id: 7, name: "Éphémère", items: items("movie", 1), updated_at: "1", public: false };
    u.account.lists.push(list);
    await sync(u.userId);
    u.account.lists = [];
    await sync(u.userId);
    expect((await db()`select status from tmdb_lists where tmdb_list_id = '7'`)[0]!.status).toBe("gone");
    u.account.lists = [list];
    await sync(u.userId);
    expect((await db()`select status from tmdb_lists where tmdb_list_id = '7'`)[0]!.status).toBe("ok");
  });

  it("stops and flags the account when the token is revoked, keeping the catalogs", async () => {
    const u = await connectedUser(fake, "acc-1");
    u.account.watchlist.movie = items("movie", 1, 2);
    await sync(u.userId);
    fake.tokens.clear(); // user revoked the app on themoviedb.org
    const r = await sync(u.userId);
    expect(r.status).toBe("skipped");
    const [a] = await db()`select status from tmdb_accounts where user_id = ${u.userId}`;
    expect(a!.status).toBe("revoked");
    expect(await stored(u.userId, "watchlist_movie", "movie")).toHaveLength(2);
  });

  it("skips unchanged lists thanks to signatures (quota saving)", async () => {
    const u = await connectedUser(fake, "acc-1");
    u.account.lists.push({ id: 7, name: "A", items: items("movie", 1), updated_at: "1", public: false });
    await sync(u.userId);
    fake.calls = [];
    await sync(u.userId);
    expect(fake.calls.filter((c) => c.startsWith("GET /4/list/"))).toHaveLength(0);
    expect(fake.calls.filter((c) => c.startsWith("GET /3/movie/"))).toHaveLength(0); // metadata cached
  });

  it("uses tmdb: ids for titles without IMDb id and hides titles deleted on TMDB", async () => {
    const u = await connectedUser(fake, "acc-1");
    fake.setMedia("movie", 5, { title: "Indé", imdb: null });
    fake.setMedia("movie", 6, { title: "Supprimé", missing: true });
    fake.setMedia("movie", 7, { title: "The Title", frTitle: "Le Titre", overview: "Résumé", frPoster: true });
    u.account.watchlist.movie = items("movie", 5, 6, 7);
    await sync(u.userId);
    const rows = await db()`select tmdb_id, imdb_id, title, overview, poster_path from catalog_items where user_id = ${u.userId} order by position`;
    expect(rows.map((r) => r.tmdb_id)).toEqual([5, 7]);
    expect(rows[0]).toMatchObject({ imdb_id: null, title: "Indé" });
    expect(rows[1]).toMatchObject({ imdb_id: "tt1000007", title: "Le Titre", overview: "Résumé", poster_path: "/fr-7.jpg" });
  });

  it("keeps old metadata when a refresh fails", async () => {
    const u = await connectedUser(fake, "acc-1");
    u.account.watchlist.movie = items("movie", 9);
    await sync(u.userId);
    await db()`update tmdb_media set refresh_after = now() - interval '1 minute'`;
    fake.fail(/GET \/3\/movie\/9/, 500, 10);
    await sync(u.userId, "manual");
    const [m] = await db()`select status, title, error_count from tmdb_media where tmdb_id = 9`;
    expect(m).toMatchObject({ status: "ok", error_count: 1 });
    expect(m!.title).toBeTruthy();
  });

  it("prevents concurrent synchronisations with a lease lock", async () => {
    const u = await connectedUser(fake, "acc-1");
    expect(await acquireUserLock(u.userId, crypto.randomUUID(), 60)).toBe(true);
    expect((await sync(u.userId)).status).toBe("locked");
    // An expired lease (crashed function) does not block forever.
    await db()`update users set sync_lock_until = now() - interval '1 second' where id = ${u.userId}`;
    expect((await sync(u.userId)).status).toBe("success");
  });

  it("cron processes due users only, catches up missed runs and schedules the next one", async () => {
    const a = await connectedUser(fake, "acc-1");
    const b = await connectedUser(fake, "acc-2");
    a.account.watchlist.movie = items("movie", 1);
    b.account.watchlist.movie = items("movie", 2);
    await db()`update users set next_sync_at = now() + interval '1 hour' where id = ${b.userId}`;
    // a was due long ago (simulates failed / delayed crons)
    await db()`update users set next_sync_at = now() - interval '3 hours' where id = ${a.userId}`;

    const summary = await runCronTick({ budgetMs: 40_000, client });
    expect(summary.usersProcessed).toBe(1);
    expect(await stored(a.userId, "watchlist_movie", "movie")).toHaveLength(1);
    expect(await stored(b.userId, "watchlist_movie", "movie")).toHaveLength(0);
    const [ua] = await db()`select extract(epoch from next_sync_at - now())::int as secs, last_sync_status from users where id = ${a.userId}`;
    expect(ua!.last_sync_status).toBe("success");
    expect(ua!.secs).toBeGreaterThan(14 * 60);
    expect(ua!.secs).toBeLessThan(17 * 60);
  });

  it("isolates users: syncing A never touches B", async () => {
    const a = await connectedUser(fake, "acc-1");
    const b = await connectedUser(fake, "acc-2");
    a.account.watchlist.movie = items("movie", 1, 2);
    b.account.watchlist.movie = items("movie", 3);
    await sync(b.userId);
    await sync(a.userId);
    a.account.watchlist.movie = [];
    await sync(a.userId);
    expect(await stored(b.userId, "watchlist_movie", "movie")).toHaveLength(1);
    expect(await stored(a.userId, "watchlist_movie", "movie")).toHaveLength(0);
  });
});
