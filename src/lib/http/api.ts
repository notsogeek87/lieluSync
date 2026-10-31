import { z } from "zod";
import { isSameOrigin } from "@/lib/security/request-guard";
import { sessionUserFromRequest } from "@/lib/auth/session";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function apiError(status: number, code: string, message?: string): Response {
  return json({ error: code, message }, status);
}

type Authed = { userId: string } | { response: Response };

/**
 * Guard for the private JSON API: requires a valid Lielu session cookie
 * (never the Stremio config id) and, for mutations, a same-origin request.
 */
export async function requireUser(req: Request, opts: { mutation?: boolean } = {}): Promise<Authed> {
  if (opts.mutation && !isSameOrigin(req)) return { response: apiError(403, "forbidden_origin") };
  const userId = await sessionUserFromRequest(req);
  if (!userId) return { response: apiError(401, "unauthenticated") };
  return { userId };
}

export async function parseJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<{ data: z.infer<S> } | { response: Response }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 16_384) return { response: apiError(413, "payload_too_large") };
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 16_384) return { response: apiError(413, "payload_too_large") };
    body = text ? JSON.parse(text) : {};
  } catch {
    return { response: apiError(400, "invalid_json") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { response: apiError(400, "invalid_body", parsed.error.issues[0]?.message) };
  return { data: parsed.data };
}
