import { db, closeDb } from "@/lib/db/client";
import { applyMigrations } from "../../scripts/migrate";

/** Recreates the public schema and applies all migrations. Requires TEST_DATABASE_URL (or the local default). */
export async function resetDatabase(): Promise<void> {
  const sql = db();
  await sql.unsafe("drop schema if exists public cascade; create schema public;");
  const origLog = console.log;
  console.log = () => {};
  try {
    await applyMigrations(sql);
  } finally {
    console.log = origLog;
  }
}

export async function truncateAll(): Promise<void> {
  await db().unsafe(`truncate users, tmdb_media, rate_limits, auth_requests restart identity cascade`);
}

export { db, closeDb };
