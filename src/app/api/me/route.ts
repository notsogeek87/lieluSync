import { requireUser, json, apiError } from "@/lib/http/api";
import { getOverview } from "@/lib/account/overview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const overview = await getOverview(auth.userId);
  if (!overview) return apiError(404, "not_found");
  return json(overview);
}
