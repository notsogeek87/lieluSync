import { handleCatalog } from "@/lib/stremio/service";
import { stremioOptions } from "@/lib/stremio/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // room for an on-demand background sync

export async function GET(req: Request, ctx: { params: Promise<{ token: string; type: string; rest: string[] }> }) {
  const { token, type, rest } = await ctx.params;
  return handleCatalog(req, token, type, rest);
}

export const OPTIONS = stremioOptions;
