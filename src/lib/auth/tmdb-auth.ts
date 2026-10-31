import { env } from "@/lib/config/env";
import { log } from "@/lib/log";
import { db } from "@/lib/db/client";
import { randomToken, safeEqual } from "@/lib/security/crypto";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { tmdb } from "@/lib/tmdb";
import { consumeAuthRequest, storeAuthRequest, AUTH_REQUEST_TTL_MINUTES } from "@/lib/repo/auth-requests";
import { createSession, SESSION_TTL_DAYS } from "@/lib/repo/sessions";
import { createUser } from "@/lib/repo/users";
import { getAccessToken, getAccountByObjectId, getAccountByUser, saveConnection, type ProfileInput } from "@/lib/repo/tmdb-accounts";
import { clearCookie, oauthCookieName, readCookie, serializeCookie, sessionCookieName } from "./cookies";

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}

function appUrl(path: string): string {
  return `${env().APP_URL}${path}`;
}

/**
 * Step 1 of the TMDB v4 user authentication: create a request token bound to
 * a random state (stored server-side, encrypted; mirrored in an HttpOnly cookie
 * to prevent login CSRF) and send the user to TMDB for approval.
 */
export async function startTmdbLogin(req: Request, currentUserId: string | null): Promise<Response> {
  const rl = await rateLimit(`login:${clientIp(req.headers)}`, 20, 600);
  if (!rl.allowed) return redirect(appUrl("/?error=rate_limited"));
  try {
    const state = randomToken(32);
    const requestToken = await tmdb().createRequestToken(appUrl(`/api/auth/tmdb/callback?state=${state}`));
    await storeAuthRequest(state, requestToken, currentUserId);
    return redirect(tmdb().approveUrl(requestToken), [
      serializeCookie(oauthCookieName(), state, { maxAge: AUTH_REQUEST_TTL_MINUTES * 60 }),
    ]);
  } catch (err) {
    log.error("auth.start_failed", { err });
    return redirect(appUrl("/?error=tmdb_unavailable"));
  }
}

async function fetchProfile(accessToken: string): Promise<ProfileInput> {
  try {
    const p = await tmdb().getProfile(accessToken);
    return { v3AccountId: p.id, username: p.username, displayName: p.name, avatarPath: p.avatarPath };
  } catch (err) {
    log.warn("auth.profile_unavailable", { err });
    return {};
  }
}

export type CallbackOutcome = { ok: true; userId: string; isNew: boolean } | { ok: false; error: string };

/**
 * Step 3: exchange the approved request token for a user access token, then
 * create or resume the Lielu account bound to that TMDB account.
 */
export async function completeTmdbLogin(req: Request, onConnected?: (userId: string) => void): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const cookieState = readCookie(req.headers.get("cookie"), oauthCookieName()) ?? "";
  const clear = clearCookie(oauthCookieName());

  if (!state || !cookieState || !safeEqual(state, cookieState)) {
    return redirect(appUrl("/?error=invalid_state"), [clear]);
  }
  const pending = await consumeAuthRequest(state);
  if (!pending) return redirect(appUrl("/?error=expired"), [clear]);

  let accessToken: string;
  let accountObjectId: string;
  try {
    ({ accessToken, accountObjectId } = await tmdb().createAccessToken(pending.requestToken));
  } catch (err) {
    log.warn("auth.exchange_failed", { err });
    return redirect(appUrl("/?error=tmdb_denied"), [clear]);
  }

  const profile = await fetchProfile(accessToken);
  const outcome = await bindAccount(pending.userId, accountObjectId, accessToken, profile);
  if (!outcome.ok) {
    // Do not keep a token we will not use.
    await tmdb().revokeAccessToken(accessToken).catch(() => undefined);
    return redirect(appUrl(`/?error=${outcome.error}`), [clear]);
  }

  const session = await createSession(outcome.userId);
  onConnected?.(outcome.userId);
  return redirect(appUrl(outcome.isNew ? "/dashboard?welcome=1" : "/dashboard?connected=1"), [
    clear,
    serializeCookie(sessionCookieName(), session.token, { maxAge: SESSION_TTL_DAYS * 86400 }),
  ]);
}

export async function bindAccount(reconnectUserId: string | null, accountObjectId: string, accessToken: string, profile: ProfileInput): Promise<CallbackOutcome> {
  const sql = db();
  const existing = await getAccountByObjectId(accountObjectId);

  if (reconnectUserId) {
    const current = await getAccountByUser(reconnectUserId);
    // A Lielu account stays bound to one TMDB account; another user's TMDB account cannot be attached.
    if ((current && current.account_object_id !== accountObjectId) || (existing && existing.user_id !== reconnectUserId)) {
      return { ok: false, error: "account_mismatch" };
    }
    await replaceConnection(reconnectUserId, accountObjectId, accessToken, profile);
    await sql`update users set next_sync_at = now(), sync_enabled = true where id = ${reconnectUserId}`;
    return { ok: true, userId: reconnectUserId, isNew: false };
  }

  if (existing) {
    await replaceConnection(existing.user_id, accountObjectId, accessToken, profile);
    await sql`update users set next_sync_at = now(), sync_enabled = true where id = ${existing.user_id}`;
    return { ok: true, userId: existing.user_id, isNew: false };
  }

  const user = await sql.begin(async (tx) => {
    const u = await createUser(tx);
    await saveConnection(u.id, accountObjectId, accessToken, profile, tx);
    return u;
  });
  return { ok: true, userId: user.id, isNew: true };
}

/** Stores the new token, then revokes the previous one so it does not linger on TMDB. */
async function replaceConnection(userId: string, accountObjectId: string, accessToken: string, profile: ProfileInput): Promise<void> {
  const previous = await getAccessToken(userId).catch(() => null);
  await saveConnection(userId, accountObjectId, accessToken, profile);
  if (previous && previous !== accessToken) await revokeStoredToken(previous);
}

/** Revokes the token on TMDB (best effort) and forgets it locally. */
export async function revokeStoredToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    await tmdb().revokeAccessToken(token);
    return true;
  } catch (err) {
    log.warn("auth.revoke_failed", { err });
    return false;
  }
}
