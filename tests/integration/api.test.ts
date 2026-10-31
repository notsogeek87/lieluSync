import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, truncateAll, db, closeDb } from "../helpers/db";
import { setupFakeTmdb, connectedUser, authedRequest, params, APP } from "../helpers/world";
import { items, type FakeTmdb } from "../helpers/fake-tmdb";
import type { TmdbClient } from "@/lib/tmdb/client";
import { syncUser } from "@/lib/sync/engine";
import { GET as cron } from "@/app/api/cron/sync/route";
import { GET as lists } from "@/app/api/lists/route";
import { PATCH as patchCatalog } from "@/app/api/catalogs/[id]/route";
import { POST as manualSync } from "@/app/api/sync/route";
import { POST as regenerate } from "@/app/api/config/regenerate/route";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { GET as manifestRoute } from "@/app/u/[token]/manifest.json/route";
import { rateLimit } from "@/lib/security/rate-limit";

let fake: FakeTmdb;
let client: TmdbClient;

beforeAll(async () => { await resetDatabase(); });
afterAll(async () => { await closeDb(); });
beforeEach(async () => { await truncateAll(); ({ fake, client } = setupFakeTmdb()); });

describe("route protection", () => {
  it("cron requires the dedicated secret", async () => {
    expect((await cron(new Request(`${APP}/api/cron/sync`))).status).toBe(401);
    expect((await cron(new Request(`${APP}/api/cron/sync`, { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    const ok = await cron(new Request(`${APP}/api/cron/sync`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
  });

  it("private API requires a session; the Stremio id is not a credential", async () => {
    const u = await connectedUser(fake, "acc-1");
    expect((await lists(authedRequest("/api/lists", null))).status).toBe(401);
    expect((await lists(authedRequest("/api/lists", u.configToken))).status).toBe(401);
    expect((await lists(authedRequest("/api/lists", u.sessionToken))).status).toBe(200);
  });

  it("mutations require same-origin requests (CSRF)", async () => {
    const u = await connectedUser(fake, "acc-1");
    const res = await regenerate(authedRequest("/api/config/regenerate", u.sessionToken, { method: "POST", origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    const noOrigin = await regenerate(authedRequest("/api/config/regenerate", u.sessionToken, { method: "POST", origin: null }));
    expect(noOrigin.status).toBe(403);
  });

  it("a user cannot modify another user's catalog", async () => {
    const a = await connectedUser(fake, "acc-1");
    const b = await connectedUser(fake, "acc-2");
    a.account.watchlist.movie = items("movie", 1);
    await syncUser(a.userId, "manual", { client });
    const [cat] = await db()`select id from selected_catalogs where user_id = ${a.userId}`;
    const body = JSON.stringify({ enabled: false });
    const asB = await patchCatalog(authedRequest(`/api/catalogs/${cat!.id}`, b.sessionToken, { method: "PATCH", body }), params({ id: cat!.id }));
    expect(asB.status).toBe(404);
    const asA = await patchCatalog(authedRequest(`/api/catalogs/${cat!.id}`, a.sessionToken, { method: "PATCH", body }), params({ id: cat!.id }));
    expect(asA.status).toBe(200);
    expect((await db()`select enabled from selected_catalogs where id = ${cat!.id}`)[0]!.enabled).toBe(false);
  });

  it("validates input", async () => {
    const a = await connectedUser(fake, "acc-1");
    const id = crypto.randomUUID();
    const bad = await patchCatalog(authedRequest(`/api/catalogs/${id}`, a.sessionToken, { method: "PATCH", body: JSON.stringify({ customName: "x".repeat(200) }) }), params({ id }));
    expect(bad.status).toBe(400);
    const notJson = await patchCatalog(authedRequest(`/api/catalogs/${id}`, a.sessionToken, { method: "PATCH", body: "{" }), params({ id }));
    expect(notJson.status).toBe(400);
    const badId = await patchCatalog(authedRequest(`/api/catalogs/x`, a.sessionToken, { method: "PATCH", body: "{}" }), params({ id: "x' or 1=1" }));
    expect(badId.status).toBe(404);
  });

  it("manual sync is throttled", async () => {
    const a = await connectedUser(fake, "acc-1");
    const first = await manualSync(authedRequest("/api/sync", a.sessionToken, { method: "POST" }));
    expect(first.status).toBe(200);
    const second = await manualSync(authedRequest("/api/sync", a.sessionToken, { method: "POST" }));
    expect(second.status).toBe(429);
  });

  it("regenerating the Stremio URL invalidates the previous one", async () => {
    const a = await connectedUser(fake, "acc-1");
    const res = await regenerate(authedRequest("/api/config/regenerate", a.sessionToken, { method: "POST" }));
    const { install } = await res.json();
    const newToken = install.manifestUrl.split("/u/")[1].split("/")[0];
    expect(newToken).not.toBe(a.configToken);
    const old = await manifestRoute(new Request(`${APP}/u/x/manifest.json`), params({ token: a.configToken }));
    expect(old.status).toBe(404);
    const fresh = await manifestRoute(new Request(`${APP}/u/x/manifest.json`), params({ token: newToken }));
    expect(fresh.status).toBe(200);
  });

  it("account deletion revokes TMDB access and removes every user row", async () => {
    const a = await connectedUser(fake, "acc-1");
    const b = await connectedUser(fake, "acc-2");
    a.account.watchlist.movie = items("movie", 1, 2);
    b.account.watchlist.movie = items("movie", 2);
    await syncUser(a.userId, "manual", { client });
    await syncUser(b.userId, "manual", { client });

    const refused = await deleteAccount(authedRequest("/api/account", a.sessionToken, { method: "DELETE", body: JSON.stringify({ confirm: "oui" }) }));
    expect(refused.status).toBe(400);
    const res = await deleteAccount(authedRequest("/api/account", a.sessionToken, { method: "DELETE", body: JSON.stringify({ confirm: "SUPPRIMER" }) }));
    expect(res.status).toBe(200);
    expect(fake.revoked).toContain(a.accessToken);

    for (const t of ["users", "user_sessions", "tmdb_accounts", "tmdb_tokens", "tmdb_lists", "list_items", "selected_catalogs", "sync_jobs", "sync_logs"]) {
      const [r] = await db().unsafe(`select count(*)::int as n from ${t} where ${t === "users" ? "id" : "user_id"} = $1`, [a.userId]);
      expect(r!.n, t).toBe(0);
    }
    // B is untouched.
    expect((await db()`select count(*)::int as n from list_items where user_id = ${b.userId}`)[0]!.n).toBe(1);
  });

  it("rate limiter counts per key and window", async () => {
    const r1 = await rateLimit("k", 2, 60);
    const r2 = await rateLimit("k", 2, 60);
    const r3 = await rateLimit("k", 2, 60);
    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, false]);
    expect((await rateLimit("other", 2, 60)).allowed).toBe(true);
    const keys = await db()`select key from rate_limits`;
    expect(keys.every((k) => k.key !== "k")).toBe(true); // hashed
  });
});
