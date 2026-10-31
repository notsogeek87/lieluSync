import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, truncateAll, db, closeDb } from "../helpers/db";
import { setupFakeTmdb, APP, connectedUser, authedRequest } from "../helpers/world";
import type { FakeTmdb } from "../helpers/fake-tmdb";
import { GET as login } from "@/app/api/auth/tmdb/login/route";
import { GET as callback } from "@/app/api/auth/tmdb/callback/route";
import { POST as disconnect } from "@/app/api/tmdb/disconnect/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/me/route";
import { getAccessToken } from "@/lib/repo/tmdb-accounts";

let fake: FakeTmdb;

beforeAll(async () => { await resetDatabase(); });
afterAll(async () => { await closeDb(); });
beforeEach(async () => { await truncateAll(); ({ fake } = setupFakeTmdb()); });

function cookieValue(res: Response, name: string): string | null {
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(";");
    const [k, v] = kv!.split("=");
    if (k === name) return v ?? "";
  }
  return null;
}

async function startLogin(cookie?: string) {
  const res = await login(new Request(`${APP}/api/auth/tmdb/login`, { headers: cookie ? { cookie } : {} }));
  expect(res.status).toBe(303);
  const location = new URL(res.headers.get("location")!);
  expect(location.origin + location.pathname).toBe("https://www.themoviedb.org/auth/access");
  const requestToken = location.searchParams.get("request_token")!;
  const state = cookieValue(res, "__Host-lielu_oauth")!;
  const redirectTo = new URL(fake.requestTokens.get(requestToken)!.redirectTo!);
  expect(redirectTo.searchParams.get("state")).toBe(state);
  return { requestToken, state, callbackUrl: redirectTo.toString() };
}

describe("TMDB v4 authentication", () => {
  it("connects a new user end-to-end and stores the token encrypted", async () => {
    fake.addAccount("acc-1");
    const { requestToken, state, callbackUrl } = await startLogin();
    fake.requestTokens.get(requestToken)!.approvedFor = "acc-1"; // user approves on TMDB

    const res = await callback(new Request(callbackUrl, { headers: { cookie: `__Host-lielu_oauth=${state}` } }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${APP}/dashboard?welcome=1`);
    const session = cookieValue(res, "__Host-lielu_session");
    expect(session).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers.getSetCookie().join("\n")).toMatch(/__Host-lielu_session=.*HttpOnly.*Secure/);

    const [row] = await db()`select t.access_token_enc, a.username, a.display_name from tmdb_tokens t join tmdb_accounts a using (user_id)`;
    const issued = [...fake.tokens.keys()][0]!;
    expect(row!.access_token_enc).not.toContain(issued);
    expect(row!.username).toBe("user-acc-1");

    const profile = await me(authedRequest("/api/me", session));
    expect(profile.status).toBe(200);
    const body = await profile.json();
    expect(body.tmdb.status).toBe("connected");
    expect(JSON.stringify(body)).not.toContain(issued);
    expect(body.install.manifestUrl).toMatch(/^https:\/\/lists\.test\.local\/u\/[A-Za-z0-9_-]{43}\/manifest\.json$/);
  });

  it("rejects a callback without the matching state cookie (login CSRF)", async () => {
    fake.addAccount("acc-1");
    const { requestToken, callbackUrl } = await startLogin();
    fake.requestTokens.get(requestToken)!.approvedFor = "acc-1";
    const res = await callback(new Request(callbackUrl, { headers: { cookie: "__Host-lielu_oauth=forged" } }));
    expect(res.headers.get("location")).toBe(`${APP}/?error=invalid_state`);
    expect((await db()`select count(*)::int as n from users`)[0]!.n).toBe(0);
  });

  it("state is single-use", async () => {
    fake.addAccount("acc-1");
    const { requestToken, state, callbackUrl } = await startLogin();
    fake.requestTokens.get(requestToken)!.approvedFor = "acc-1";
    const cookie = { cookie: `__Host-lielu_oauth=${state}` };
    await callback(new Request(callbackUrl, { headers: cookie }));
    const again = await callback(new Request(callbackUrl, { headers: cookie }));
    expect(again.headers.get("location")).toBe(`${APP}/?error=expired`);
  });

  it("handles a refused authorisation", async () => {
    const { state, callbackUrl } = await startLogin();
    const res = await callback(new Request(callbackUrl, { headers: { cookie: `__Host-lielu_oauth=${state}` } }));
    expect(res.headers.get("location")).toBe(`${APP}/?error=tmdb_denied`);
  });

  it("logging in again resumes the same account and revokes the previous token", async () => {
    const u = await connectedUser(fake, "acc-1");
    const { requestToken, state, callbackUrl } = await startLogin();
    fake.requestTokens.get(requestToken)!.approvedFor = "acc-1";
    const res = await callback(new Request(callbackUrl, { headers: { cookie: `__Host-lielu_oauth=${state}` } }));
    expect(res.headers.get("location")).toBe(`${APP}/dashboard?connected=1`);
    expect((await db()`select count(*)::int as n from users`)[0]!.n).toBe(1);
    expect(fake.revoked).toContain(u.accessToken);
  });

  it("refuses to attach another user's TMDB account when reconnecting", async () => {
    await connectedUser(fake, "acc-1");
    const b = await connectedUser(fake, "acc-2");
    const { requestToken, state, callbackUrl } = await startLogin(`__Host-lielu_session=${b.sessionToken}`);
    fake.requestTokens.get(requestToken)!.approvedFor = "acc-1";
    const res = await callback(new Request(callbackUrl, { headers: { cookie: `__Host-lielu_oauth=${state}; __Host-lielu_session=${b.sessionToken}` } }));
    expect(res.headers.get("location")).toBe(`${APP}/?error=account_mismatch`);
  });

  it("disconnect revokes the token on TMDB and deletes it", async () => {
    const u = await connectedUser(fake, "acc-1");
    const res = await disconnect(authedRequest("/api/tmdb/disconnect", u.sessionToken, { method: "POST" }));
    expect(res.status).toBe(200);
    expect((await res.json()).revokedOnTmdb).toBe(true);
    expect(fake.revoked).toContain(u.accessToken);
    expect(await getAccessToken(u.userId)).toBeNull();
    expect((await db()`select count(*)::int as n from tmdb_tokens`)[0]!.n).toBe(0);
  });

  it("logout ends the web session", async () => {
    const u = await connectedUser(fake, "acc-1");
    await logout(authedRequest("/api/auth/logout", u.sessionToken, { method: "POST" }));
    expect((await me(authedRequest("/api/me", u.sessionToken))).status).toBe(401);
  });
});
