import { z } from "zod";
import { requireUser, json, parseJson } from "@/lib/http/api";
import { clearCookie, sessionCookieName } from "@/lib/auth/cookies";
import { revokeStoredToken } from "@/lib/auth/tmdb-auth";
import { getAccessToken } from "@/lib/repo/tmdb-accounts";
import { deleteUser } from "@/lib/repo/users";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const body = z.object({ confirm: z.literal("SUPPRIMER") });

/**
 * Deletes the Lielu Lists account: revokes the TMDB token, then deletes the
 * user row; foreign keys cascade to sessions, tokens, lists, items, catalogs,
 * jobs and logs. The shared TMDB metadata cache holds no personal data.
 */
export async function DELETE(req: Request) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const parsed = await parseJson(req, body);
  if ("response" in parsed) return parsed.response;
  const token = await getAccessToken(auth.userId).catch(() => null);
  await revokeStoredToken(token);
  await deleteUser(auth.userId);
  log.info("account.deleted");
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(sessionCookieName()) });
}
