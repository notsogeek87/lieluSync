import { z } from "zod";
import { requireUser, json, apiError, parseJson } from "@/lib/http/api";
import { updateCatalog } from "@/lib/repo/lists";

export const dynamic = "force-dynamic";

const body = z
  .object({
    enabled: z.boolean().optional(),
    customName: z
      .string()
      .trim()
      .max(80)
      .transform((v) => (v.length ? v : null))
      .nullable()
      .optional(),
  })
  .refine((b) => b.enabled !== undefined || b.customName !== undefined, "nothing to update");

const uuid = z.string().uuid();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return apiError(404, "not_found");
  const parsed = await parseJson(req, body);
  if ("response" in parsed) return parsed.response;
  const ok = await updateCatalog(auth.userId, id, parsed.data);
  return ok ? json({ ok: true }) : apiError(404, "not_found");
}
