import { db, type Db } from "@/lib/db/client";
import { decryptSecret, encryptSecret, hashToken, randomToken } from "@/lib/security/crypto";

export interface UserRow {
  id: string;
  created_at: Date;
  config_token_hash: string;
  config_token_enc: string;
  config_token_rotated_at: Date;
  sync_enabled: boolean;
  next_sync_at: Date;
  last_sync_started_at: Date | null;
  last_sync_finished_at: Date | null;
  last_sync_status: "success" | "partial" | "failed" | "skipped" | null;
  last_successful_sync_at: Date | null;
  consecutive_failures: number;
  last_manual_sync_at: Date | null;
  sync_lock_until: Date | null;
}

const CONFIG_AAD = "stremio-config";

/** 32 random bytes → 43-char base64url identifier, never derived from TMDB data. */
export function newConfigToken(): { token: string; hash: string; enc: string } {
  const token = randomToken(32);
  return { token, hash: hashToken(token, "config"), enc: encryptSecret(token, CONFIG_AAD) };
}

export function decryptConfigToken(user: Pick<UserRow, "config_token_enc">): string {
  return decryptSecret(user.config_token_enc, CONFIG_AAD);
}

export async function createUser(sql: Db = db()): Promise<UserRow> {
  const cfg = newConfigToken();
  const [row] = await sql<UserRow[]>`
    insert into users (config_token_hash, config_token_enc) values (${cfg.hash}, ${cfg.enc}) returning *`;
  return row!;
}

export async function getUserById(id: string, sql: Db = db()): Promise<UserRow | null> {
  const [row] = await sql<UserRow[]>`select * from users where id = ${id}`;
  return row ?? null;
}

/** Resolve a Stremio configuration identifier (from the addon URL). */
export async function getUserByConfigToken(token: string, sql: Db = db()): Promise<UserRow | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await sql<UserRow[]>`select * from users where config_token_hash = ${hashToken(token, "config")}`;
  return row ?? null;
}

/** Regenerates the addon identifier; the previous URL stops working immediately. */
export async function rotateConfigToken(userId: string, sql: Db = db()): Promise<string> {
  const cfg = newConfigToken();
  await sql`
    update users set config_token_hash = ${cfg.hash}, config_token_enc = ${cfg.enc},
      config_token_rotated_at = now(), updated_at = now()
    where id = ${userId}`;
  return cfg.token;
}

/** Deletes the user and — through ON DELETE CASCADE — every row that belongs to them. */
export async function deleteUser(userId: string, sql: Db = db()): Promise<void> {
  await sql`delete from users where id = ${userId}`;
}
