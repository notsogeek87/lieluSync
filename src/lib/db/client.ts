import postgres from "postgres";
import { env } from "@/lib/config/env";

export type Sql = postgres.Sql;
/** Either the pool or a transaction handle. */
export type Db = postgres.Sql | postgres.TransactionSql;

declare global {
  // eslint-disable-next-line no-var
  var __lieluSql: postgres.Sql | undefined;
}

function sslFor(url: string): "require" | false {
  const forced = env().DATABASE_SSL;
  if (forced) return forced === "require" ? "require" : false;
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) ? false : "require";
}

/**
 * Single pooled client per function instance. Uses `prepare: false` so it is
 * compatible with the Supabase transaction pooler (Supavisor, port 6543),
 * which is the recommended mode for serverless functions.
 */
export function db(): postgres.Sql {
  if (!globalThis.__lieluSql) {
    const url = env().DATABASE_URL;
    globalThis.__lieluSql = postgres(url, {
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: sslFor(url),
      onnotice: () => {},
      transform: { undefined: null },
    });
  }
  return globalThis.__lieluSql;
}

export async function closeDb(): Promise<void> {
  if (globalThis.__lieluSql) {
    await globalThis.__lieluSql.end({ timeout: 5 });
    globalThis.__lieluSql = undefined;
  }
}
