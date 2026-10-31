import { handleManifest } from "@/lib/stremio/service";
import { stremioOptions } from "@/lib/stremio/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return handleManifest(req, token);
}

export const OPTIONS = stremioOptions;
