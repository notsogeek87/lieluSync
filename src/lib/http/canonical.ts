/**
 * Canonical host redirect for the web UI. Sessions and the TMDB OAuth state
 * are cookies bound to APP_URL's host, so pages must be served there. Addon
 * (/u/…) and API routes stay reachable on every host so that addons installed
 * with an older URL keep working and schedulers are not redirected.
 */
export function canonicalRedirect(input: { host: string | null; pathname: string; search: string; method: string; appUrl: string | undefined; vercelEnv: string | undefined }): string | null {
  if (input.vercelEnv !== "production" || !input.appUrl || !input.host) return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  if (input.pathname.startsWith("/u/") || input.pathname.startsWith("/api/") || input.pathname.startsWith("/_next/")) return null;
  let app: URL;
  try {
    app = new URL(input.appUrl);
  } catch {
    return null;
  }
  if (input.host.toLowerCase() === app.host.toLowerCase()) return null;
  return `${app.origin}${input.pathname}${input.search}`;
}
