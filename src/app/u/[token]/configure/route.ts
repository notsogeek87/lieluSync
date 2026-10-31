import { env } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/** Stremio's "Configure" button opens {addon}/configure: send users to the (authenticated) web UI. */
export async function GET() {
  return Response.redirect(`${env().APP_URL}/lists`, 302);
}
