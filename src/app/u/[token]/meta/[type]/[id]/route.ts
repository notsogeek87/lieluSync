import { handleMeta } from "@/lib/stremio/service";
import { stremioOptions } from "@/lib/stremio/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ token: string; type: string; id: string }> }) {
  const { token, type, id } = await ctx.params;
  return handleMeta(req, token, type, id);
}

export const OPTIONS = stremioOptions;
