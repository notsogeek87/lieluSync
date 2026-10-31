import { cookies } from "next/headers";
import { resolveSession } from "@/lib/repo/sessions";
import { readCookie, sessionCookieName } from "./cookies";

/** User id behind the session cookie of an API request, or null. */
export async function sessionUserFromRequest(req: Request): Promise<string | null> {
  const token = readCookie(req.headers.get("cookie"), sessionCookieName());
  if (!token) return null;
  try {
    return await resolveSession(token);
  } catch {
    return null;
  }
}

export function sessionTokenFromRequest(req: Request): string | null {
  return readCookie(req.headers.get("cookie"), sessionCookieName());
}

/** Same, for Server Components (pages). */
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token) return null;
  try {
    return await resolveSession(token);
  } catch {
    return null;
  }
}
