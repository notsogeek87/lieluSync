import { env } from "@/lib/config/env";

/**
 * CSRF protection for state-changing JSON endpoints: the session cookie is
 * SameSite=Lax, and we additionally require the Origin (or Sec-Fetch-Site)
 * to match the application origin.
 */
export function isSameOrigin(req: Request): boolean {
  const appOrigin = new URL(env().APP_URL).origin;
  const origin = req.headers.get("origin");
  if (origin) return origin === appOrigin;
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  return false;
}
