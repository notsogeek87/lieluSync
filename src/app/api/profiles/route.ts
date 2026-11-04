import { z } from "zod";
import { requireUser, json, apiError, parseJson } from "@/lib/http/api";
import { createProfile, decryptProfileToken, listProfiles } from "@/lib/repo/profiles";
import { installUrls } from "@/lib/account/overview";

export const dynamic = "force-dynamic";

const profileBody = z.object({
  name: z.string().trim().min(1).max(40),
  catalogIds: z.array(z.string().uuid()).max(500),
});

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const profiles = await listProfiles(auth.userId);
  return json({
    profiles: profiles.map((p) => ({ id: p.id, name: p.name, catalogIds: p.catalog_ids, install: installUrls(decryptProfileToken(p)) })),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser(req, { mutation: true });
  if ("response" in auth) return auth.response;
  const parsed = await parseJson(req, profileBody);
  if ("response" in parsed) return parsed.response;
  const r = await createProfile(auth.userId, parsed.data.name, parsed.data.catalogIds);
  if (!r.ok) return apiError(r.error === "limit" ? 409 : 400, r.error, r.error === "limit" ? "Nombre maximum de profils atteint." : undefined);
  return json({ ok: true, id: r.id }, 201);
}
