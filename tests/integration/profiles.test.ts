import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, truncateAll, closeDb } from "../helpers/db";
import { setupFakeTmdb, connectedUser, authedRequest, APP, params } from "../helpers/world";
import { items, type FakeTmdb } from "../helpers/fake-tmdb";
import type { TmdbClient } from "@/lib/tmdb/client";
import { syncUser } from "@/lib/sync/engine";
import { getEnabledCatalogs } from "@/lib/repo/catalogs";
import { decryptProfileToken, listProfiles } from "@/lib/repo/profiles";
import { GET as manifestRoute } from "@/app/u/[token]/manifest.json/route";
import { GET as catalogRoute } from "@/app/u/[token]/catalog/[type]/[...rest]/route";
import { GET as listProfilesRoute, POST as createProfileRoute } from "@/app/api/profiles/route";
import { PATCH as patchProfileRoute, DELETE as deleteProfileRoute } from "@/app/api/profiles/[id]/route";
import { POST as regenerateRoute } from "@/app/api/profiles/[id]/regenerate/route";

let fake: FakeTmdb;
let client: TmdbClient;

beforeAll(async () => { await resetDatabase(); });
afterAll(async () => { await closeDb(); });
beforeEach(async () => { await truncateAll(); ({ fake, client } = setupFakeTmdb()); });

const manifest = (token: string) => manifestRoute(new Request(`${APP}/u/${token}/manifest.json`), params({ token }));
const catalog = (token: string, type: string, ...rest: string[]) => catalogRoute(new Request(`${APP}/u/${token}/catalog/${type}/${rest.join("/")}`), params({ token, type, rest }));
const post = (path: string, session: string, body: unknown) => authedRequest(path, session, { method: "POST", body: JSON.stringify(body) });

async function setup(account = "acc-1") {
  const u = await connectedUser(fake, account);
  u.account.watchlist.movie = items("movie", 1, 2, 3);
  u.account.watchlist.tv = items("tv", 500);
  u.account.lists.push({ id: 7, name: "Charlie", items: items("movie", 1), updated_at: "1", public: false });
  await syncUser(u.userId, "manual", { client, deadline: Date.now() + 30_000 });
  const catalogs = await getEnabledCatalogs(u.userId);
  return { ...u, catalogs };
}

async function makeProfile(u: Awaited<ReturnType<typeof setup>>, name: string, ids: string[]) {
  const res = await createProfileRoute(post("/api/profiles", u.sessionToken, { name, catalogIds: ids }));
  expect(res.status).toBe(201);
  const [p] = (await listProfiles(u.userId)).filter((x) => x.name === name);
  return { profile: p!, token: decryptProfileToken(p!) };
}

describe("profiles", () => {
  it("exposes only the chosen catalogs in the profile manifest, while the main URL keeps everything", async () => {
    const u = await setup();
    const charlie = u.catalogs.find((c) => c.name === "Charlie")!;
    const { profile, token } = await makeProfile(u, "Enfants", [charlie.id]);

    const m = await (await manifest(token)).json();
    expect(m.catalogs.map((c: any) => c.name)).toEqual(["Charlie"]);
    expect(m.name).toBe("Lielu Lists · Enfants");
    expect(m.id).not.toBe("eu.lielu.lists");

    const main = await (await manifest(u.configToken)).json();
    expect(main.id).toBe("eu.lielu.lists");
    expect(main.catalogs.length).toBe(u.catalogs.length);
    expect(profile.catalog_ids).toEqual([charlie.id]);
  });

  it("refuses catalog pages outside the profile", async () => {
    const u = await setup();
    const charlie = u.catalogs.find((c) => c.name === "Charlie")!;
    const other = u.catalogs.find((c) => c.name === "Ma Watchlist" && c.media_type === "movie")!;
    const { token } = await makeProfile(u, "Enfants", [charlie.id]);

    expect((await catalog(token, "movie", `ll-${charlie.id}.json`)).status).toBe(200);
    expect((await catalog(token, "movie", `ll-${other.id}.json`)).status).toBe(404);
    expect((await catalog(u.configToken, "movie", `ll-${other.id}.json`)).status).toBe(200);
  });

  it("updates the selection and renames a profile", async () => {
    const u = await setup();
    const [a, b] = u.catalogs;
    const { profile, token } = await makeProfile(u, "Soirée", [a!.id]);
    const res = await patchProfileRoute(authedRequest(`/api/profiles/${profile.id}`, u.sessionToken, { method: "PATCH", body: JSON.stringify({ name: "Film", catalogIds: [a!.id, b!.id] }) }), params({ id: profile.id }));
    expect(res.status).toBe(200);
    const m = await (await manifest(token)).json();
    expect(m.catalogs).toHaveLength(2);
    expect(m.name).toBe("Lielu Lists · Film");
  });

  it("rotates a profile token, invalidating the old URL", async () => {
    const u = await setup();
    const { profile, token } = await makeProfile(u, "Enfants", [u.catalogs[0]!.id]);
    const res = await regenerateRoute(authedRequest(`/api/profiles/${profile.id}/regenerate`, u.sessionToken, { method: "POST" }), params({ id: profile.id }));
    expect(res.status).toBe(200);
    const fresh = (await res.json()).install.manifestUrl.split("/u/")[1].split("/")[0];
    expect((await manifest(token)).status).toBe(404);
    expect((await manifest(fresh)).status).toBe(200);
  });

  it("deletes a profile and its URL stops working", async () => {
    const u = await setup();
    const { profile, token } = await makeProfile(u, "Enfants", [u.catalogs[0]!.id]);
    const res = await deleteProfileRoute(authedRequest(`/api/profiles/${profile.id}`, u.sessionToken, { method: "DELETE" }), params({ id: profile.id }));
    expect(res.status).toBe(200);
    expect((await manifest(token)).status).toBe(404);
  });

  it("never lets a user attach or touch another user's catalogs or profiles", async () => {
    const u1 = await setup("acc-1");
    const u2 = await setup("acc-2");
    const bad = await createProfileRoute(post("/api/profiles", u2.sessionToken, { name: "Vol", catalogIds: [u1.catalogs[0]!.id] }));
    expect(bad.status).toBe(400);

    const { profile } = await makeProfile(u1, "Privé", [u1.catalogs[0]!.id]);
    const patch = await patchProfileRoute(authedRequest(`/api/profiles/${profile.id}`, u2.sessionToken, { method: "PATCH", body: JSON.stringify({ name: "X" }) }), params({ id: profile.id }));
    expect(patch.status).toBe(404);
    const del = await deleteProfileRoute(authedRequest(`/api/profiles/${profile.id}`, u2.sessionToken, { method: "DELETE" }), params({ id: profile.id }));
    expect(del.status).toBe(404);
    const list = await (await listProfilesRoute(authedRequest("/api/profiles", u2.sessionToken))).json();
    expect(list.profiles).toEqual([]);
  });

  it("requires a session and a same-origin request", async () => {
    expect((await createProfileRoute(post("/api/profiles", "", { name: "x", catalogIds: [] }))).status).toBe(401);
    const u = await setup();
    const res = await createProfileRoute(authedRequest("/api/profiles", u.sessionToken, { method: "POST", origin: "https://evil.example", body: JSON.stringify({ name: "x", catalogIds: [] }) }));
    expect(res.status).toBe(403);
  });
});
