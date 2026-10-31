import { startTmdbLogin } from "@/lib/auth/tmdb-auth";
import { sessionUserFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Starts (or restarts, for reconnection) the TMDB authorisation flow. */
export async function GET(req: Request) {
  const currentUser = await sessionUserFromRequest(req);
  return startTmdbLogin(req, currentUser);
}
