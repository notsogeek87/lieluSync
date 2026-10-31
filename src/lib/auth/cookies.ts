import { env } from "@/lib/config/env";

export function isSecureApp(): boolean {
  return env().APP_URL.startsWith("https://");
}

/** "__Host-" prefix (Secure, Path=/, no Domain) whenever the app is served over HTTPS. */
export function sessionCookieName(): string {
  return isSecureApp() ? "__Host-lielu_session" : "lielu_session";
}

export function oauthCookieName(): string {
  return isSecureApp() ? "__Host-lielu_oauth" : "lielu_oauth";
}

export function serializeCookie(name: string, value: string, opts: { maxAge: number; sameSite?: "Lax" | "Strict" }): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", `SameSite=${opts.sameSite ?? "Lax"}`, `Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`];
  if (isSecureApp()) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name: string): string {
  return serializeCookie(name, "", { maxAge: 0 });
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}
