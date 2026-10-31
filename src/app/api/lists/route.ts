import { requireUser, json } from "@/lib/http/api";
import { getListsForUser } from "@/lib/repo/lists";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  return json({ lists: await getListsForUser(auth.userId) });
}
