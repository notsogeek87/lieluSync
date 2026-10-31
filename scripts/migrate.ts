/**
 * Minimal migration runner: applies supabase/migrations/*.sql in order and
 * records them in public._lielu_migrations. Equivalent to `supabase db push`
 * for environments where the Supabase CLI is not available.
 *
 * Usage: DATABASE_URL=... npm run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const clean = new URL(url);
  for (const k of ["sslmode", "channel_binding"]) clean.searchParams.delete(k);
  const sql = postgres(clean.toString(), { prepare: false, max: 1, ssl: local ? false : "require", onnotice: () => {} });
  try {
    await applyMigrations(sql);
  } finally {
    await sql.end();
  }
}

export async function applyMigrations(sql: postgres.Sql, dir = path.resolve(process.cwd(), "supabase/migrations")): Promise<string[]> {
  await sql`create table if not exists public._lielu_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from public._lielu_migrations`).map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const content = readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into public._lielu_migrations (name) values (${file})`;
    });
    applied.push(file);
    console.log(`applied ${file}`);
  }
  if (applied.length === 0) console.log("database is up to date");
  return applied;
}

if (process.argv[1] && /migrate\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
