import { db, type Db } from "@/lib/db/client";
import { hashToken, randomToken } from "@/lib/security/crypto";

export const SESSION_TTL_DAYS = 30;

export async function createSession(userId: string, sql: Db = db()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await sql`insert into user_sessions (user_id, token_hash, expires_at) values (${userId}, ${hashToken(token, "session")}, ${expiresAt})`;
  return { token, expiresAt };
}

/** Returns the user id for a valid session, sliding its expiry at most once per hour. */
export async function resolveSession(token: string, sql: Db = db()): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await sql<{ user_id: string }[]>`
    update user_sessions
       set last_seen_at = now(),
           expires_at = case when last_seen_at < now() - interval '1 hour'
                             then now() + make_interval(days => ${SESSION_TTL_DAYS}) else expires_at end
     where token_hash = ${hashToken(token, "session")} and expires_at > now()
     returning user_id`;
  return row?.user_id ?? null;
}

export async function deleteSession(token: string, sql: Db = db()): Promise<void> {
  await sql`delete from user_sessions where token_hash = ${hashToken(token, "session")}`;
}

export async function deleteUserSessions(userId: string, sql: Db = db()): Promise<void> {
  await sql`delete from user_sessions where user_id = ${userId}`;
}
