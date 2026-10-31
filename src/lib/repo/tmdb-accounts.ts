import { db, type Db } from "@/lib/db/client";
import { decryptSecret, encryptSecret, needsReencryption } from "@/lib/security/crypto";

const AAD = "tmdb-access-token";

export interface TmdbAccountRow {
  user_id: string;
  account_object_id: string;
  v3_account_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_path: string | null;
  status: "connected" | "revoked" | "disconnected";
  connected_at: Date;
  disconnected_at: Date | null;
}

export async function getAccountByUser(userId: string, sql: Db = db()): Promise<TmdbAccountRow | null> {
  const [row] = await sql<TmdbAccountRow[]>`select * from tmdb_accounts where user_id = ${userId}`;
  return row ?? null;
}

export async function getAccountByObjectId(accountObjectId: string, sql: Db = db()): Promise<TmdbAccountRow | null> {
  const [row] = await sql<TmdbAccountRow[]>`select * from tmdb_accounts where account_object_id = ${accountObjectId}`;
  return row ?? null;
}

export interface ProfileInput {
  v3AccountId?: number | null;
  username?: string | null;
  displayName?: string | null;
  avatarPath?: string | null;
}

/** Stores (encrypted) the user's v4 access token and marks the account connected. */
export async function saveConnection(userId: string, accountObjectId: string, accessToken: string, profile: ProfileInput, sql: Db = db()): Promise<void> {
  await sql`
    insert into tmdb_accounts (user_id, account_object_id, v3_account_id, username, display_name, avatar_path, status, connected_at, disconnected_at, updated_at)
    values (${userId}, ${accountObjectId}, ${profile.v3AccountId ?? null}, ${profile.username ?? null}, ${profile.displayName ?? null},
            ${profile.avatarPath ?? null}, 'connected', now(), null, now())
    on conflict (user_id) do update set
      account_object_id = excluded.account_object_id,
      v3_account_id = coalesce(excluded.v3_account_id, tmdb_accounts.v3_account_id),
      username = coalesce(excluded.username, tmdb_accounts.username),
      display_name = coalesce(excluded.display_name, tmdb_accounts.display_name),
      avatar_path = coalesce(excluded.avatar_path, tmdb_accounts.avatar_path),
      status = 'connected', connected_at = now(), disconnected_at = null, updated_at = now()`;
  await sql`
    insert into tmdb_tokens (user_id, access_token_enc) values (${userId}, ${encryptSecret(accessToken, AAD)})
    on conflict (user_id) do update set access_token_enc = excluded.access_token_enc, created_at = now(), invalidated_at = null, last_used_at = null`;
}

/** Decrypted user token, or null when missing / invalidated. Re-encrypts with the current key after a rotation. */
export async function getAccessToken(userId: string, sql: Db = db()): Promise<string | null> {
  const [row] = await sql<{ access_token_enc: string; invalidated_at: Date | null }[]>`
    select t.access_token_enc, t.invalidated_at from tmdb_tokens t
    join tmdb_accounts a on a.user_id = t.user_id
    where t.user_id = ${userId} and a.status = 'connected'`;
  if (!row || row.invalidated_at) return null;
  const token = decryptSecret(row.access_token_enc, AAD);
  if (needsReencryption(row.access_token_enc)) {
    await sql`update tmdb_tokens set access_token_enc = ${encryptSecret(token, AAD)} where user_id = ${userId}`;
  }
  await sql`update tmdb_tokens set last_used_at = now() where user_id = ${userId}`;
  return token;
}

/** TMDB answered 401 with the user token: stop using it until the user reconnects. */
export async function markTokenRevoked(userId: string, sql: Db = db()): Promise<void> {
  await sql`update tmdb_tokens set invalidated_at = now() where user_id = ${userId}`;
  await sql`update tmdb_accounts set status = 'revoked', updated_at = now() where user_id = ${userId}`;
}

/** Removes the token (after revocation on TMDB) but keeps the account link and synced data. */
export async function disconnectAccount(userId: string, sql: Db = db()): Promise<void> {
  await sql`delete from tmdb_tokens where user_id = ${userId}`;
  await sql`update tmdb_accounts set status = 'disconnected', disconnected_at = now(), updated_at = now() where user_id = ${userId}`;
}
