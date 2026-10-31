import { requireUser, json } from "@/lib/http/api";
import { rotateConfigToken } from "@/lib/repo/users";
import { installUrls } from "@/lib/account/overview";

export const dynamic = "force-dynamic";

/** Issues a new Stremio URL; the previous one stops working immediately. */
export async function POST(req: Request) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const token = await rotateConfigToken(auth.userId);
  return json({ ok: true, install: installUrls(token) });
}
