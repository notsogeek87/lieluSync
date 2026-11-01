import { z } from "zod";
import { requireUser, json, apiError, parseJson } from "@/lib/http/api";
import { reorderCatalogs } from "@/lib/repo/lists";

export const dynamic = "force-dynamic";

const body = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/** Saves the order of the user's catalogs as shown on the Stremio home screen. */
export async function POST(req: Request) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const parsed = await parseJson(req, body);
  if ("response" in parsed) return parsed.response;
  const ok = await reorderCatalogs(auth.userId, parsed.data.ids);
  return ok ? json({ ok: true }) : apiError(400, "invalid_catalogs");
}
