import { db, type Db } from "@/lib/db/client";
import { decryptSecret, encryptSecret, hashToken } from "@/lib/security/crypto";

const AAD = "tmdb-request-token";
export const AUTH_REQUEST_TTL_MINUTES = 15; // TMDB request tokens expire after 15 minutes

export async function storeAuthRequest(state: string, requestToken: string, userId: string | null, sql: Db = db()): Promise<void> {
  await sql`
    insert into auth_requests (state_hash, request_token_enc, user_id, expires_at)
    values (${hashToken(state, "oauth-state")}, ${encryptSecret(requestToken, AAD)}, ${userId},
            now() + make_interval(mins => ${AUTH_REQUEST_TTL_MINUTES}))`;
}

/** Single-use: the row is deleted as it is read. */
export async function consumeAuthRequest(state: string, sql: Db = db()): Promise<{ requestToken: string; userId: string | null } | null> {
  const [row] = await sql<{ request_token_enc: string; user_id: string | null }[]>`
    delete from auth_requests where state_hash = ${hashToken(state, "oauth-state")} and expires_at > now()
    returning request_token_enc, user_id`;
  if (!row) return null;
  return { requestToken: decryptSecret(row.request_token_enc, AAD), userId: row.user_id };
}
