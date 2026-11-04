import { z } from "zod";
import { requireUser, json, apiError } from "@/lib/http/api";
import { rotateProfileToken } from "@/lib/repo/profiles";
import { installUrls } from "@/lib/account/overview";

export const dynamic = "force-dynamic";

/** Issues a new install URL for one profile; its previous URL stops working immediately. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return apiError(404, "not_found");
  const token = await rotateProfileToken(auth.userId, id);
  return token ? json({ ok: true, install: installUrls(token) }) : apiError(404, "not_found");
}
