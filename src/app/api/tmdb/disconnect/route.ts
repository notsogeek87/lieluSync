import { requireUser, json } from "@/lib/http/api";
import { revokeStoredToken } from "@/lib/auth/tmdb-auth";
import { disconnectAccount, getAccessToken } from "@/lib/repo/tmdb-accounts";

export const dynamic = "force-dynamic";

/**
 * Revokes the TMDB access token on TMDB and deletes it. Synced catalogs stay
 * available in Stremio (frozen) until the user reconnects or deletes the account.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const token = await getAccessToken(auth.userId).catch(() => null);
  const revoked = await revokeStoredToken(token);
  await disconnectAccount(auth.userId);
  return json({ ok: true, revokedOnTmdb: revoked });
}
