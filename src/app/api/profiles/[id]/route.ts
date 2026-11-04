import { z } from "zod";
import { requireUser, json, apiError, parseJson } from "@/lib/http/api";
import { deleteProfile, updateProfile } from "@/lib/repo/profiles";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const patchBody = z
  .object({ name: z.string().trim().min(1).max(40).optional(), catalogIds: z.array(z.string().uuid()).max(500).optional() })
  .refine((b) => b.name !== undefined || b.catalogIds !== undefined, "nothing to update");

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return apiError(404, "not_found");
  const parsed = await parseJson(req, patchBody);
  if ("response" in parsed) return parsed.response;
  const r = await updateProfile(auth.userId, id, parsed.data);
  if (r.ok) return json({ ok: true });
  return apiError(r.error === "not_found" ? 404 : 400, r.error);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return apiError(404, "not_found");
  return (await deleteProfile(auth.userId, id)) ? json({ ok: true }) : apiError(404, "not_found");
}
