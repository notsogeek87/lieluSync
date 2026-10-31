import { clearCookie, sessionCookieName } from "@/lib/auth/cookies";
import { sessionTokenFromRequest } from "@/lib/auth/session";
import { deleteSession } from "@/lib/repo/sessions";
import { isSameOrigin } from "@/lib/security/request-guard";
import { apiError, json } from "@/lib/http/api";

export const dynamic = "force-dynamic";

/** Ends the Lielu web session (TMDB stays connected, sync continues). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return apiError(403, "forbidden_origin");
  const token = sessionTokenFromRequest(req);
  if (token) await deleteSession(token).catch(() => undefined);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(sessionCookieName()) });
}
